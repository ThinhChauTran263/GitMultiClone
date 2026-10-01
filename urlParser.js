const fs = require('fs');
const path = require('path');

/**
 * Extracts and cleans GitHub repository URLs from any text input.
 * Supports:
 * - Line-by-line inputs
 * - Messy inline strings with punctuation, quotes, brackets
 * - URLs with or without .git extension
 * - Case-insensitive match for github.com
 */
function extractGithubUrls(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    return [];
  }

  // Match https://github.com/:owner/:repoPath
  // Captures owner and the repo segment
  const regex = /https?:\/\/github\.com\/([a-zA-Z0-9_\.\-]+)\/([^\s"'<>,;()[\]]+)/gi;

  const results = [];
  const seenUrls = new Set();
  let match;

  while ((match = regex.exec(rawText)) !== null) {
    let owner = match[1].trim();
    let repoPath = match[2].trim();

    // Strip hash (#) and query params (?)
    repoPath = repoPath.split(/[#\?]/)[0];

    // If repoPath contains slashes (e.g. repo/tree/main or repo/issues), take the first segment (the repo name)
    let repoName = repoPath.split('/')[0];

    // Clean trailing punctuation
    repoName = repoName.replace(/[\.,\/\?;:!>\]'"]+$/, '');
    owner = owner.replace(/[\.,\/\?;:!>\]'"]+$/, '');

    // Strip .git if present at the end
    if (repoName.toLowerCase().endsWith('.git')) {
      repoName = repoName.slice(0, -4);
    }

    // Skip special GitHub routes
    const reservedRoutes = ['features', 'topics', 'trending', 'collections', 'events', 'explore', 'orgs', 'users'];
    if (reservedRoutes.includes(owner.toLowerCase()) || !owner || !repoName) {
      continue;
    }

    // Standardized Git clone URL
    const cleanGitUrl = `https://github.com/${owner}/${repoName}.git`;
    const cleanWebUrl = `https://github.com/${owner}/${repoName}`;

    // Track uniqueness based on normalized lowercase URL
    const urlKey = cleanGitUrl.toLowerCase();
    const isDuplicate = seenUrls.has(urlKey);
    seenUrls.add(urlKey);

    results.push({
      originalMatch: match[0],
      owner,
      repoName,
      cloneUrl: cleanGitUrl,
      webUrl: cleanWebUrl,
      isDuplicateInInput: isDuplicate
    });
  }

  return results;
}

/**
 * Resolves local target folder names for a list of parsed repos.
 * If multiple repos share the same repoName, or if the target directory already exists on disk,
 * appends the author name: `${repoName}-${owner}`.
 * If that still collides, appends counter: `${repoName}-${owner}-2`.
 */
function resolveFolderNames(repos, targetBasePath) {
  const claimedNames = new Set();

  const folderExistsOnDisk = (folderName) => {
    if (!targetBasePath) return false;
    try {
      const fullPath = path.join(targetBasePath, folderName);
      return fs.existsSync(fullPath);
    } catch (e) {
      return false;
    }
  };

  return repos.map((item, index) => {
    const baseName = item.repoName;
    let targetName = baseName;
    let collisionReason = null;

    const baseNameLower = baseName.toLowerCase();
    const isClaimedInBatch = claimedNames.has(baseNameLower);
    const existsOnDisk = folderExistsOnDisk(baseName);

    if (isClaimedInBatch || existsOnDisk) {
      // First fallback: repoName-owner
      targetName = `${baseName}-${item.owner}`;
      collisionReason = isClaimedInBatch ? 'Duplicate repo name in input batch' : 'Folder already exists in target path';

      let counter = 2;
      while (claimedNames.has(targetName.toLowerCase()) || folderExistsOnDisk(targetName)) {
        targetName = `${baseName}-${item.owner}-${counter}`;
        counter++;
      }
    }

    claimedNames.add(targetName.toLowerCase());

    return {
      index: index + 1,
      owner: item.owner,
      repoName: item.repoName,
      cloneUrl: item.cloneUrl,
      webUrl: item.webUrl,
      targetFolder: targetName,
      originalName: baseName,
      hasCollision: targetName !== baseName,
      collisionReason: collisionReason
    };
  });
}

module.exports = {
  extractGithubUrls,
  resolveFolderNames
};
