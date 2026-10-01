const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { extractGithubUrls, resolveFolderNames } = require('../urlParser');

console.log('--- RUNNING PARSER UNIT TESTS ---');

// Test 1: Multiline & messy string extraction
const rawInput = `
Here are some repos to clone:
https://github.com/DietrichGebert/ponytail.git
https://github.com/anotherAuthor/ponytail.git
Check this one too: "https://github.com/facebook/react.git", and <https://github.com/vuejs/core>!
randomtext https://github.com/userC/ponytail.git#readme and more text
`;

const extracted = extractGithubUrls(rawInput);
console.log('Extracted count:', extracted.length);
assert.strictEqual(extracted.length, 5, 'Should extract exactly 5 repos');
assert.strictEqual(extracted[0].owner, 'DietrichGebert');
assert.strictEqual(extracted[0].repoName, 'ponytail');
assert.strictEqual(extracted[0].cloneUrl, 'https://github.com/DietrichGebert/ponytail.git');

assert.strictEqual(extracted[1].owner, 'anotherAuthor');
assert.strictEqual(extracted[1].repoName, 'ponytail');

assert.strictEqual(extracted[2].owner, 'facebook');
assert.strictEqual(extracted[2].repoName, 'react');

assert.strictEqual(extracted[3].owner, 'vuejs');
assert.strictEqual(extracted[3].repoName, 'core');

assert.strictEqual(extracted[4].owner, 'userC');
assert.strictEqual(extracted[4].repoName, 'ponytail');
console.log('✓ Test 1 passed: Extract GitHub URLs accurately from messy string');

// Test 2: Name collision auto-resolution (ponytail, ponytail-anotherAuthor, ponytail-userC)
const resolved = resolveFolderNames(extracted, null);
console.log('Resolved folder names:');
resolved.forEach(r => console.log(`  ${r.owner}/${r.repoName} -> target folder: "${r.targetFolder}" (Collision: ${r.hasCollision})`));

assert.strictEqual(resolved[0].targetFolder, 'ponytail');
assert.strictEqual(resolved[0].hasCollision, false);

assert.strictEqual(resolved[1].targetFolder, 'ponytail-anotherAuthor');
assert.strictEqual(resolved[1].hasCollision, true);

assert.strictEqual(resolved[2].targetFolder, 'react');
assert.strictEqual(resolved[2].hasCollision, false);

assert.strictEqual(resolved[3].targetFolder, 'core');
assert.strictEqual(resolved[3].hasCollision, false);

assert.strictEqual(resolved[4].targetFolder, 'ponytail-userC');
assert.strictEqual(resolved[4].hasCollision, true);
console.log('✓ Test 2 passed: Duplicate repo names resolved to repo-author format');

// Test 3: Existing folder on disk
const dummyDir = path.join(__dirname, 'dummy_target');
if (!fs.existsSync(dummyDir)) fs.mkdirSync(dummyDir, { recursive: true });
fs.mkdirSync(path.join(dummyDir, 'react'), { recursive: true });

const resolvedWithDisk = resolveFolderNames(extracted, dummyDir);
console.log('Resolved with existing disk folder "react":');
resolvedWithDisk.forEach(r => console.log(`  ${r.owner}/${r.repoName} -> target folder: "${r.targetFolder}"`));

// "react" exists on disk, so facebook/react should become "react-facebook"
assert.strictEqual(resolvedWithDisk[2].targetFolder, 'react-facebook');
assert.strictEqual(resolvedWithDisk[2].hasCollision, true);

// Cleanup dummy directory
fs.rmSync(dummyDir, { recursive: true, force: true });
console.log('✓ Test 3 passed: Disk collision resolved gracefully');

console.log('--- ALL PARSER TESTS PASSED! ---');
