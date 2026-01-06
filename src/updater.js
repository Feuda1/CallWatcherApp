const { exec } = require('child_process');
const { app } = require('electron');

function runGit(command) {
    return new Promise((resolve, reject) => {
        exec(command, { cwd: app.getAppPath() }, (error, stdout, stderr) => {
            if (error) {
                resolve('');
                return;
            }
            resolve(stdout.trim());
        });
    });
}

async function checkForUpdates() {
    try {
        await runGit('git fetch');
        const output = await runGit('git rev-list HEAD..origin/main --count');
        const count = parseInt(output, 10);
        return !isNaN(count) && count > 0;
    } catch (e) {
        return false;
    }
}

async function updateApp() {
    try {
        await runGit('git pull');
    } catch (e) { }
}

module.exports = { checkForUpdates, updateApp };
