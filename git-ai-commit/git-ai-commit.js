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

async function runCompletion(changes, messageHint, model, count) {
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
                
                                
  let result = []
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
      n: count,
    })
    result = response.data.choices.map((choice) => choice.text) 
  } catch (e) {
    console.log(e)
    throw e
  }
  return result
}

async function runStep(changesString, hint, model) {
  const res = await runCompletion(changesString, hint, model, 1)
  const result = res[0]
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

async function runMultiple(changesString, hint, model, count) {
  const res = await runCompletion(changesString, hint, model, count)
  console.log(`Messages:`)
  res.forEach((message, index) => {
    console.log(`${index + 1}. "${message}"`)
  })
  readline.question(`Enter the number of the message you want to use for the commit: `, async (answer) => {
    const number = parseInt(answer)
    if (number > 0 && number <= count) {
      console.log(`git commit -m "${res[number - 1]}"`)
      execPromise(`git commit -m "${res[number - 1]}"`)
      readline.close()
    } else {
      console.log('Cancelled')
      readline.close()
      process.exit(0)
    }
  })
}

function estimateTokenCount(string) {
  //estimate token count, wihout splitting the string
  const k = 0.5
  const n = string.length
  return Math.round(k * n)
}


function truncateToEstimated(string, max_tokens) {
  const k = 0.5
  let result = string
  if (string.length > max_tokens / k) {
    result = string.substring(0, max_tokens)
    if (result.length > 0) {
      result += '\n<truncated>'
    } else {
      result = '<truncated>'
    }
  }
  return result
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
  const count = argv.includes('--count') ? parseInt(argv[argv.indexOf('--count') + 1]) : 1
  //check if it is git repo
  const { stdout: gitStatus, stderr: gitStatusError } = await execPromise('git status');
  if (gitStatusError) {
    console.error(`error: ${gitStatusError}`);
    process.exit(0)
    return;
  }
  //get repo path with git rev-parse --show-toplevel
  const { stdout: gitRepoPath, stderr: gitRepoPathError } = await execPromise('git rev-parse --show-toplevel');
  if (gitRepoPathError) {
    console.error(`error: ${gitRepoPathError}`);
    process.exit(0)
    return;
  }
  const rootPath = gitRepoPath.trim()



  if (verbose) {
    console.log(`Using model: ${model}`)
  }
  if (verbose && hint) {
    console.log(`Using hint: ${hint}`)
  }

  //exec git diff for staged changes
  //we need to get full path to the file
  const { stdout, stderr } = await execPromise('git diff --staged --name-status');
  if (stderr) {
    console.error(`error: ${stderr}`);
    process.exit(0)
    return;
  }
  
  //console.log(`stdout: ${stdout}`);
  const files = stdout.split('\n').map(line => {
    /*
        A       README.md
    R098    git-describe/git-describe.js    git-ai-commit/git-ai-commit.js
    R100    git-describe/package-lock.json  git-ai-commit/package-lock.json
    R070    git-describe/package.json       git-ai-commit/package.json
    */
    const [status, oldName, newName] = line.split('\t')
    let filename = newName ? newName : oldName
    if (!status || !filename) return null
    return { status, filename, line }
  }).filter(file => file)
  if (verbose) {
    console.log(`Found ${files.length} files with changes`)
  }
  if (files.length === 0) {
    console.log('No changes to commit')
    process.exit(0)
    return
  }

  const changesFilesString = files.map(file => {
    return file.line
  }).join('\n') 

  //exec git diff for each file
  const changes = await Promise.all(files.map(async file => {
    const { stdout, stderr } = await execPromise(`git diff --color=never --staged "${rootPath}/${file.filename}"`);
    if (stderr) {
      console.log(`error: ${stderr}`);
      return;
    }
    return {
      filename: file.filename,
      content: stdout,
      estimated_tokens: estimateTokenCount(stdout)
    }
  }))

  changes.sort((a, b) => a.estimated_tokens - b.estimated_tokens)

  //calc max tokens, it is max model output tokens - 512
  const max_tokens = 1024*2
  //we need to combine changes for all files in such a way that total token count is less than max_tokens
  //we will try to combine changes for each file, starting from the smallest one

  let totalEstimatedTokens = 0
  for (let i = 0; i < changes.length; i++) {
    totalEstimatedTokens += changes[i].estimated_tokens
  }
  if (verbose) {
    console.log(`Total estimated tokens: ${totalEstimatedTokens}`)
  }
  if (totalEstimatedTokens > max_tokens) {
    //we need to truncate some changes
    let totalTokens = 0
    for (let i = 0; i < changes.length; i++) {
      const change = changes[i]
      const leftTokens = (max_tokens - totalTokens) * 0.8
      if (leftTokens < 0) {
        //remove this change
        changes.splice(i, 1)
        i--
        continue
      }
      if (change.estimated_tokens > leftTokens) {
        //truncate this change
        const truncated = truncateToEstimated(change.content, leftTokens)
        if (truncated === '<truncated>' || truncated.length < 20) {
          //remove this change
          changes.splice(i, 1)
          i--
          continue
        }
        change.content = truncated
        change.estimated_tokens = estimateTokenCount(truncated)
      }
      totalTokens += change.estimated_tokens
    }
    if (verbose) {
      console.log(`Total estimated tokens after truncation: ${totalTokens}`)
    }
  }

  const changesString = truncateToEstimated(changes.map(change => {
    return change.content
  }).join('\n'), max_tokens)
  
  if (!changesString) {
    console.log('No changes to commit')
    process.exit(0)
    return
  }
  const modelInput = '% git diff --staged --name-status\n'
      + changesFilesString + '\n' 
      + '% git diff --color=never --staged\n'
      + changesString
  if (verbose) {
    console.log(modelInput)
  }
  
  
  //send changes to OpenAI's API
  if (count > 1) {
    await runMultiple(modelInput, hint, model, count)
  } else {
    await runStep(modelInput, hint, model)
  }
}


function print_usage() {
  console.log('Usage: git-ai-commit [--verbose] [--hint <hint>] [--model <model>]')
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
  