const { default: chalk } = require('chalk');
const fetch = require('node-fetch');
const fs = require('fs');

const moduleName = require('./package.json').name;

const quietRepo = 'https://raw.githubusercontent.com/quiet/quiet-js/708084716f20d21c420df18ed8812a72105e8783/';

const requirements = {
    quietEs: quietRepo + 'quiet-emscripten.js',
    quietEsMem: quietRepo + 'quiet-emscripten.js.mem',
    quietProfiles: quietRepo + 'quiet-profiles.json',
    quietBase: quietRepo + 'quiet.js'
};

const log = console.log.bind(console, chalk.bgBlack.white(moduleName));

async function downloadRequirements() {
    const total = Object.keys(requirements).length;
    let step = -1;

    function incrementProgress() {
        process.stdout.clearLine();
        process.stdout.cursorTo(0);
        process.stdout.write(Math.ceil(100 * (++step) / total) + '%');
    }

    incrementProgress();

    return Promise.all(Object.keys(requirements).map(async key => {
        const url = requirements[key];
        const res = await fetch(url);

        requirements[key] = await (url.endsWith('mem')
            ? res.buffer()
            : res.text()
        );

        incrementProgress();
    }));
}

/**
 * @param {Buffer} buffer
 */
function bufferToLiteral(buffer) {
    return 'Uint8Array.from(atob(`'
        + buffer.toString('base64')
        + '`), c => c.charCodeAt(0))';
}

/**
 * Replaces the body of a function, given its name
 * @param {string} code - Original code where the function is written
 * @param {string} name - Name of the function, or any text that precedes the 
 * first `{` of the function body
 * @param {string} replacement - New content for the function body
 * @returns {string} The new `code` with the modified function
 */
function replaceFunctionBody(code, name, replacement) {
    let depth = 0;
    let start = -1;
    let i;
    for (i = code.indexOf(name); ; i++) {
        if (code[i] === '{') {
            if (depth === 0) start = i + 1;
            depth++;
        };
        if (code[i] === '}') {
            depth--;
            if (!depth) break;
        }
    }

    const end = i;
    return code.substring(0, start) + replacement + code.substring(end);
}

async function bundle() {
    log('Downloading requirements...');
    await downloadRequirements();
    console.log();

    log('Bundling...');

    let code = [
        `let mem=${bufferToLiteral(requirements.quietEsMem)}`,
        replaceFunctionBody(requirements.quietBase, 'setProfilesPrefix', `onProfilesFetch(${'\`' + requirements.quietProfiles + '\`'})`),
        `Quiet.init({profilesPrefix: 'https://quiet.github.io/quiet-js/javascripts/', memoryInitializerPrefix: 'https://quiet.github.io/quiet-js/javascripts/'})`,
        replaceFunctionBody(requirements.quietEs, 'Module["readAsync"]', 'onload(mem);'),
        `Quiet.Module=Module`,
        `module.exports=Quiet`
    ].join(';\n');

    await new Promise((resolve, reject) =>
        fs.writeFile('_bundle.js', code, (err) => err ? reject() : resolve())
    );
    log(chalk.greenBright('Finished ! Module ready to use !'))
}

bundle().catch(e => { throw e });
