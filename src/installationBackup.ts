import fs from 'node:fs/promises';

import {
  CLIJS_BACKUP_FILE,
  ensureConfigDir,
  LEGACY_NATIVE_BINARY_BACKUP_FILE,
  getVersionedPristinePath,
  updateConfigFile,
} from './config';
import { clearAllAppliedHashes } from './systemPromptHashIndex';
import { debug, replaceFileBreakingHardLinks, doesFileExist } from './utils';
import { ClaudeCodeInstallationInfo } from './types';

// Copy a file into place atomically: copy to a sibling temp, then rename onto
// the destination. rename(2) is atomic within a filesystem, so a crash mid-copy
// leaves only a temp file — never a truncated backup that would later be trusted
// and restored as if it were pristine (F-72).
const atomicCopyFile = async (src: string, dest: string): Promise<void> => {
  const tmp = `${dest}.tmp-${process.pid}`;
  try {
    await fs.copyFile(src, tmp);
    await fs.rename(tmp, dest);
  } catch (error) {
    try {
      await fs.unlink(tmp);
    } catch {
      // best-effort temp cleanup; ignore
    }
    throw error;
  }
};

export const backupClijs = async (ccInstInfo: ClaudeCodeInstallationInfo) => {
  // Only backup cli.js for NPM installs (when cliPath is set)
  if (!ccInstInfo.cliPath) {
    debug('backupClijs: Skipping for native installation (no cliPath)');
    return;
  }

  await ensureConfigDir();
  debug(`Backing up cli.js to ${CLIJS_BACKUP_FILE}`);
  await atomicCopyFile(ccInstInfo.cliPath, CLIJS_BACKUP_FILE);
  await updateConfigFile(config => {
    config.changesApplied = false;
    config.ccVersion = ccInstInfo.version;
  });
};

/**
 * Backs up the native installation binary next to itself as `<binary>.pristine`.
 * If the legacy `~/.tweakcc/native-binary.backup` exists we prefer to migrate
 * it (rename in-place) instead of re-copying — the legacy file was already the
 * pristine binary from before tweakcc first ran, so it is authoritative.
 */
export const backupNativeBinary = async (
  ccInstInfo: ClaudeCodeInstallationInfo
) => {
  if (!ccInstInfo.nativeInstallationPath) {
    return;
  }

  const pristinePath = getVersionedPristinePath(
    ccInstInfo.nativeInstallationPath
  );

  await ensureConfigDir();

  // Migration: legacy backup exists → move it to the versioned path, delete
  // the old location. Skip if the new path already has a copy (would clobber
  // a newer pristine with an older one).
  if (
    (await doesFileExist(LEGACY_NATIVE_BINARY_BACKUP_FILE)) &&
    !(await doesFileExist(pristinePath))
  ) {
    debug(
      `Migrating legacy backup ${LEGACY_NATIVE_BINARY_BACKUP_FILE} → ${pristinePath}`
    );
    try {
      await fs.rename(LEGACY_NATIVE_BINARY_BACKUP_FILE, pristinePath);
    } catch {
      // Cross-device or perms — fall back to copy+unlink.
      await atomicCopyFile(LEGACY_NATIVE_BINARY_BACKUP_FILE, pristinePath);
      try {
        await fs.unlink(LEGACY_NATIVE_BINARY_BACKUP_FILE);
      } catch {
        /* best-effort */
      }
    }
  } else {
    // Legacy stale duplicate: pristine already exists at new path, remove old.
    if (await doesFileExist(LEGACY_NATIVE_BINARY_BACKUP_FILE)) {
      try {
        await fs.unlink(LEGACY_NATIVE_BINARY_BACKUP_FILE);
      } catch {
        /* best-effort */
      }
    }
    debug(`Backing up native binary to ${pristinePath}`);
    await atomicCopyFile(ccInstInfo.nativeInstallationPath, pristinePath);
  }

  await updateConfigFile(config => {
    config.changesApplied = false;
    config.ccVersion = ccInstInfo.version;
  });
};

/**
 * Restores the original cli.js file from the backup.
 * Only applies to NPM installs. For native installs, this is a no-op.
 */
export const restoreClijsFromBackup = async (
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<boolean> => {
  // Only restore cli.js for NPM installs (when cliPath is set)
  if (!ccInstInfo.cliPath) {
    debug(
      'restoreClijsFromBackup: Skipping for native installation (no cliPath)'
    );
    return false;
  }

  if (!(await doesFileExist(CLIJS_BACKUP_FILE))) {
    debug('restoreClijsFromBackup: No backup file exists, skipping');
    return false;
  }

  debug(`Restoring cli.js from backup to ${ccInstInfo.cliPath}`);

  // Read the backup content
  const backupContent = await fs.readFile(CLIJS_BACKUP_FILE);

  // Replace the file, breaking hard links and preserving permissions
  await replaceFileBreakingHardLinks(
    ccInstInfo.cliPath,
    backupContent,
    'restore'
  );

  // Clear all applied hashes since we're restoring to defaults
  await clearAllAppliedHashes();

  await updateConfigFile(config => {
    config.changesApplied = false;
  });

  return true;
};

/**
 * Restores the native installation binary from backup.
 * This function restores the original native binary and clears changesApplied,
 * so patches can be re-applied from a clean state.
 */
export const restoreNativeBinaryFromBackup = async (
  ccInstInfo: ClaudeCodeInstallationInfo
): Promise<boolean> => {
  if (!ccInstInfo.nativeInstallationPath) {
    debug(
      'restoreNativeBinaryFromBackup: No native installation path, skipping'
    );
    return false;
  }

  // Prefer versioned pristine (new location). Fall back to legacy
  // ~/.tweakcc/native-binary.backup so users mid-migration can still restore.
  const pristinePath = getVersionedPristinePath(
    ccInstInfo.nativeInstallationPath
  );
  let backupSource: string | null = null;
  if (await doesFileExist(pristinePath)) {
    backupSource = pristinePath;
  } else if (await doesFileExist(LEGACY_NATIVE_BINARY_BACKUP_FILE)) {
    backupSource = LEGACY_NATIVE_BINARY_BACKUP_FILE;
  }
  if (!backupSource) {
    debug('restoreNativeBinaryFromBackup: No backup file exists, skipping');
    return false;
  }

  debug(
    `Restoring native binary from ${backupSource} → ${ccInstInfo.nativeInstallationPath}`
  );

  // Read the backup content
  const backupContent = await fs.readFile(backupSource);

  // Replace the file, breaking hard links and preserving permissions
  await replaceFileBreakingHardLinks(
    ccInstInfo.nativeInstallationPath,
    backupContent,
    'restore'
  );

  return true;
};
