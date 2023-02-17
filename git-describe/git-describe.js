#!/usr/bin/env node
//Script to give a message for a git commit
// Description: This script will give you a message for a git commit using git diff and OpenAI's API
// Algorithm:
// 1. Run git diff
// 2. Parse the output
// 3. Send the output to OpenAI's API
// 4. Get the response from OpenAI's API
// 5. Print the response

const { Configuration, OpenAIApi } = require("openai");
const { exec } = require("child_process");
//promisify exec
const util = require("util");
const execPromise = util.promisify(exec);

//readline
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
})

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const models = [
  'text-davinci-003',
  'text-davinci-002',
  'text-curie-001',
  'text-babbage-001',
]

const PROMPT_TEMPLATE = `### Task: Write a git commit message describing the changes made to the following files:

%CHANGES%

### As an experienced software developer, you know that a good commit message is short, yet informative. Please write a message that succinctly describes the changes made. 

%INSTRUCTION%

---

git commit -m "`

async function runCompletion(changes, messageHint, model) {
  let instruction = 'Please type your commit command with the message below:'
  if (messageHint) {
    instruction = `Please use an additional hint for your commit message. It may help you to write a better message.\n`
                + `Please describe the changes made in your commit message.\n`
                + `### Message hint:\n\n`
                + `${messageHint}\n\n`
                + `### End of message hint.\n`
                + 'Please type your commit command with the message below:'
  }
  const input = PROMPT_TEMPLATE
                .replace('%INSTRUCTION%', instruction)
                .replace('%CHANGES%', changes)
                
                                
  let result = null
  try {
    //console.log(`Running completion with:\n ${input}`)
    const response = await openai.createCompletion({
      model: model,
      prompt: input,
      temperature: 0.8,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,
      stop: ['"', '\n'],
    })
    result = response.data.choices[0].text
  } catch (e) {
    console.log(e)
  }
  return result
}

async function runStep(changesString, hint, model) {
  const result = await runCompletion(changesString, hint, model)
  console.log(`Message: "${result}"`)

  readline.question(`Is this a good message for the commit? [y/n]: `, async (answer) => {
    if (answer === 'y') {
      console.log(`git commit -m "${result}"`)
      execPromise(`git commit -m "${result}"`)
      readline.close()
    } else if (answer === 'n') {
      await runStep(changesString, hint, model)
    } else {
      console.log('Cancelled')
      readline.close()
      process.exit(0)
    }
  })
}


async function main(argv) {
  if (argv.includes('--help')) {
    print_usage()
    process.exit(0)
    return
  }
  const verbose = argv.includes('--verbose')
  const model = argv.includes('--model') ? argv[argv.indexOf('--model') + 1] : models[0]
  if (process.env.OPENAI_API_KEY === undefined) {
    console.error('Please set OPENAI_API_KEY environment variable')
    process.exit(0)
    return
  }
  const hint = argv.includes('--hint') ? argv[argv.indexOf('--hint') + 1] : null
  //check if it is git repo
  const { stdout: gitStatus, stderr: gitStatusError } = await execPromise('git status');
  if (gitStatusError) {
    console.error(`error: ${gitStatusError}`);
    process.exit(0)
    return;
  }


  if (verbose) {
    console.log(`Using model: ${model}`)
  }
  if (verbose && hint) {
    console.log(`Using hint: ${hint}`)
  }
  //exec git diff for staged changes
  //we need to get full path to the file
  const { stdout, stderr } = await execPromise('git diff --staged --name-status --relative');
  if (stderr) {
    console.error(`error: ${stderr}`);
    process.exit(0)
    return;
  }
  //parse output and collect changes individually, truncate each change to 256 characters
  //console.log(`stdout: ${stdout}`);
  const files = stdout.split('\n').map(line => {
    const [status, filename] = line.split('\t')
    if (!status || !filename) return null
    return { status, filename }
  }).filter(file => file)
  if (verbose) {
    console.log(`Found ${files.length} files with changes`)
  }
  if (files.length === 0) {
    console.log('No changes to commit')
    process.exit(0)
    return
  }
  //console.log(files)
  //exec git diff for each file
  const changes = await Promise.all(files.map(async file => {
    const { stdout, stderr } = await execPromise(`git diff --color=never --staged ${file.filename}`);
    if (stderr) {
      console.log(`error: ${stderr}`);
      return;
    }
    return stdout
  }))
  //truncate and concatenate changes 
  const changesFilesString = files.map(file => {
    return `${file.status} ${file.filename}`
  }).join('\n') 
  const changesString = changes.map(change => {
    //change.slice(0, 1024)
    if (change.length > 1024) {
      return change.slice(0, 1024) + '...'
    }
    return change
  }).join('\n').slice(0, 8192)
  if (!changesString) {
    console.log('No changes to commit')
    process.exit(0)
    return
  }
  const modelInput = '% git diff --staged --name-status --relative\n'
      + changesFilesString + '\n' 
      + '% git diff --color=never --staged\n'
      + changesString
  if (verbose) {
    console.log(modelInput)
  }
  
  
  //send changes to OpenAI's API
  await runStep(modelInput, hint, model)
}


function print_usage() {
  console.log('Usage: git-describe [--verbose] [--hint <hint>] [--model <model>]')
  console.log('Options:')
  console.log('  --model <model>  Use a specific model. Available models:')
  console.log('                   text-davinci-003')
  console.log('                   text-davinci-002')
  console.log('                   text-curie-001')
  console.log('                   text-babbage-001')
  console.log('  --hint <hint>    Use a hint for the commit message')
  console.log('  --verbose        Print more information')
  console.log('  --help           Print this help')
}


main(process.argv.slice(2));
  