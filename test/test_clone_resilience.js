const fs = require('fs');
const path = require('path');
const { extractGithubUrls, resolveFolderNames } = require('../urlParser');
const { BatchCloneManager } = require('../cloneManager');

async function runTest() {
  console.log('=== TESTING REAL BATCH CLONE WITH FAULT TOLERANCE & COLLISION ===');

  const testTargetDir = path.join(__dirname, 'test_output');
  if (fs.existsSync(testTargetDir)) {
    fs.rmSync(testTargetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testTargetDir, { recursive: true });

  // Input containing:
  // 1. Small fast repo: octocat/Hello-World
  // 2. Intentionally broken repo (should fail, but NOT stop the others!)
  // 3. Small repo: octocat/Spoon-Knife
  // 4. Duplicate name scenario: let's test a second repo that resolves to a collision
  const testInput = `
    https://github.com/octocat/Hello-World.git
    https://github.com/nonexistentuser99999/fakerepo-will-fail-1234.git
    https://github.com/octocat/Spoon-Knife.git
  `;

  const parsed = extractGithubUrls(testInput);
  console.log(`Parsed ${parsed.length} repos from input.`);

  // Let's add a fake collision item to test the collision resolver
  parsed.push({
    originalMatch: 'https://github.com/anotherAuthor/Hello-World.git',
    owner: 'anotherAuthor',
    repoName: 'Hello-World',
    cloneUrl: 'https://github.com/octocat/Hello-World.git', // we point to real repo so it clones, but with author anotherAuthor
    webUrl: 'https://github.com/anotherAuthor/Hello-World',
    isDuplicateInInput: false
  });

  const resolved = resolveFolderNames(parsed, testTargetDir);
  console.log('Resolved batch items:');
  resolved.forEach(r => {
    console.log(`  #${r.index}: ${r.owner}/${r.repoName} -> folder: "${r.targetFolder}" (Collision: ${r.hasCollision})`);
  });

  // Check collision logic
  if (resolved[3].targetFolder !== 'Hello-World-anotherAuthor') {
    throw new Error(`Expected collision targetFolder "Hello-World-anotherAuthor", got "${resolved[3].targetFolder}"`);
  }

  console.log('\nStarting BatchCloneManager (Concurrency: 2, Shallow: true)...');

  const events = [];
  const manager = new BatchCloneManager({
    baseDir: testTargetDir,
    concurrency: 2,
    shallow: true,
    onEvent: (evt) => {
      events.push(evt);
      if (evt.type === 'repo_start') {
        console.log(`[START] #${evt.index} ${evt.owner}/${evt.repoName} -> ${evt.targetFolder}`);
      } else if (evt.type === 'repo_progress' && evt.percent !== null) {
        process.stdout.write(`\r[PROG] #${evt.index} ${evt.stage}: ${evt.percent}% `);
      } else if (evt.type === 'repo_success') {
        console.log(`\n[SUCCESS] #${evt.index} ${evt.item.repoName} finished in ${evt.durationMs}ms`);
      } else if (evt.type === 'repo_failed') {
        console.log(`\n[FAILED EXPECTED] #${evt.index} ${evt.item.repoName} failed: ${evt.error.en}`);
      } else if (evt.type === 'batch_complete') {
        console.log(`\n[BATCH COMPLETE] Total: ${evt.total}, Succeeded: ${evt.succeeded}, Failed: ${evt.failed}, Time: ${evt.durationMs}ms`);
      }
    }
  });

  await new Promise((resolve) => {
    manager.onEvent = (evt) => {
      events.push(evt);
      if (evt.type === 'repo_start') {
        console.log(`[START] #${evt.index} ${evt.owner}/${evt.repoName} -> ${evt.targetFolder}`);
      } else if (evt.type === 'repo_success') {
        console.log(`[SUCCESS] #${evt.index} ${evt.item.repoName} in ${evt.durationMs}ms`);
      } else if (evt.type === 'repo_failed') {
        console.log(`[FAILED EXPECTED] #${evt.index} ${evt.item.repoName}: ${evt.error.en}`);
      } else if (evt.type === 'batch_complete') {
        console.log(`[BATCH COMPLETE] Total: ${evt.total}, Succeeded: ${evt.succeeded}, Failed: ${evt.failed}`);
        resolve(evt);
      }
    };
    manager.start(resolved);
  });

  // Verify folders on disk
  console.log('\nVerifying folders created on disk:');
  const files = fs.readdirSync(testTargetDir);
  console.log('Created directories:', files);

  if (!files.includes('Hello-World')) throw new Error('Hello-World folder missing!');
  if (!files.includes('Spoon-Knife')) throw new Error('Spoon-Knife folder missing!');
  if (!files.includes('Hello-World-anotherAuthor')) throw new Error('Hello-World-anotherAuthor collision folder missing!');

  console.log('✓ Folders verified on disk!');

  // Cleanup with retries for Windows file lock release
  await new Promise(r => setTimeout(r, 500));
  try {
    fs.rmSync(testTargetDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  } catch (e) {
    // Silently ignore if Windows locks temporarily
  }
  console.log('✓ Cleanup done!');
  console.log('=== TEST COMPLETED SUCCESSFULLY! ===');
}

runTest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
