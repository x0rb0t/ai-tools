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
  'gpt-3.5-turbo',
  'gpt-4',
  'text-davinci-003',
  'text-davinci-002',
  'text-curie-001',
  'text-babbage-001',
]

const chatModels = [
  'gpt-3.5-turbo',
  'gpt-4',
]

const PROMPT_TEMPLATE = `
Write a clear and informative git commit message describing changes made to certain files. As an experienced software developer, you know that a well-crafted commit message is essential for maintaining a clean and organized project history. A good commit message should be short, yet informative, describing the changes made in a concise manner. Examples of effective commit messages are "Update README with installation instructions" or "Fix bug in user registration process".

### Task:
Write a git commit message describing the changes made to the following files:

### Changes:
%CHANGES%
### End of changes

%INSTRUCTION%

%SUFFIX%`

async function runCompletion(changes, messageHint, model, count) {
  let isChat = chatModels.includes(model)
  
  let instruction = ''
  if (messageHint) {
    instruction = `To help you craft a better commit message, please use the additional hint provided below:
### Message hint:
${messageHint}
### End of message hint`
  }
  const input = PROMPT_TEMPLATE
                .replace('%INSTRUCTION%', instruction)
                .replace('%SUFFIX%', isChat 
                     ? 'Once you have crafted your commit message, type your git commit command in the format below:\n'
                        + '```\n'
                        + 'git commit -m "<message>"\n'
                        + "```\n"
                        + 'Please replace "<message>" with your actual commit message. Keep in mind that the goal is to create a clear and informative commit message that describes the changes made.'
                     : 'git commit -m "')
                .replace('%CHANGES%', changes)
              
  //console.log(`Running completion with:\n ${input}`)              
                                
  let result = []
  try {
    //console.log(`Running completion with:\n ${input}`)
    const params = {
      model: model,
      //temperature: 0.8,
      //max_tokens: 256,
      //top_p: 1,
      //frequency_penalty: 0,
      //presence_penalty: 0,
      //stop: ['"', '\n'],
      n: count,
    }
    if (isChat) {
      params.messages = [
        {"role": "system", "content": input},
      ]
      params.temperature = 0.8
      params.max_tokens = 256
      params.top_p = 1
    } else {
      params.prompt = input
      params.max_tokens = 256
      params.temperature = 0.8
      params.top_p = 1
      params.frequency_penalty = 0
      params.presence_penalty = 0
      params.stop = ['"', '\n']
    }
    if (isChat) {
      const response = await openai.createChatCompletion(params)
      //console.log(JSON.stringify(response.data, null, 2))
      result = response.data.choices.map((choice) => choice.message.content.trim()).map(
        command => //git commit -m "message", extract message using regex, it may be multiline
          command.match(/git commit -m "(.*)"/s)?.[1] || command
      ).filter(message => message.length > 0)
    } else {
      const response = await openai.createCompletion(params)
      result = response.data.choices.map((choice) => choice.text) 
    }
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
      const res = result.replace(/"/g, '\\"')
      console.log(`git commit -m "${res}"`)
      execPromise(`git commit -m "${res}"`)
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
  readline.question(`Enter the number of the message you want to use for the commit (or type a hint): `, async (answer) => {
    const number = parseInt(answer)
    if (number > 0 && number <= count) {
      console.log(`git commit -m "${res[number - 1]}"`)
      execPromise(`git commit -m "${res[number - 1]}"`)
      readline.close()
    } else if (answer.length > 4) {
      await runMultiple(changesString, answer, model, count)
    } else {
      console.log('Cancelled')
      readline.close()
      process.exit(0)
    }
  })
}

function estimateTokenCount(string) {
  const wordRegex = /\w+/g;
  const whitespaceRegex = /\s+/g;

  const wordTokens = string.match(wordRegex) || [];
  const whitespaceTokens = string.match(whitespaceRegex) || [];

  return wordTokens.length + whitespaceTokens.length;
}


function truncateToEstimated(string, max_tokens) {
  let tokens = 0;
  let index = 0;
  let lastSpaceIndex = -1;

  while (index < string.length && tokens < max_tokens) {
    const char = string[index];
    if (char === ' ' || char === '\n' || char === '\t' || char === '\r') {
      tokens++;
      lastSpaceIndex = index;
    } else if (index === 0 || string[index - 1] === ' ' || string[index - 1] === '\n' || string[index - 1] === '\t' || string[index - 1] === '\r') {
      tokens++;
    }
    index++;
  }

  if (index < string.length) {
    if (lastSpaceIndex !== -1) {
      return string.slice(0, lastSpaceIndex) + ' <truncated>';
    }
    return string.slice(0, index - 1) + '<truncated>';
  }

  return string;
}

async function main(argv) {
  if (argv.includes('--help')) {
    print_usage()
    process.exit(0)
    return
  }
  const verbose = argv.includes('--verbose')
  let def = 0
  if (argv.includes('--gpt4')) {
    def = 1
  }
  if (argv.includes('--old')) {
    def = 2
  }
  let model = argv.includes('--model') ? argv[argv.indexOf('--model') + 1] : models[def]
  if (!models.includes(model)) {
    console.error(`error: model ${model} is not supported`)
    process.exit(0)
    return
  }


  if (process.env.OPENAI_API_KEY === undefined) {
    console.error('Please set OPENAI_API_KEY environment variable')
    process.exit(0)
    return
  }
  const hint = argv.includes('--hint') ? argv[argv.indexOf('--hint') + 1] : null
  const count = argv.includes('--count') ? parseInt(argv[argv.indexOf('--count') + 1]) : 5
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
    console.log(`Found ${files.length} files with changes`);
  }
  if (files.length === 0) {
    console.log('No changes to commit');
    process.exit(0);
    return;
  }

  const changesFilesString = files.map(file => {
    return file.line
  }).join('\n') 

  //exec git diff for each file
  const changes = await Promise.all(files.map(async file => {
    try {
      const { stdout } = await execPromise(`git diff --color=never -U2 --staged "${rootPath}/${file.filename}"`);
      return {
        filename: file.filename,
        content: stdout,
        estimated_tokens: estimateTokenCount(stdout),
      };
    } catch (e) {
      //ignore
      return null
    }
  })).then(res => res.filter(file => file));

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
  console.log('Usage: git-ai-commit [--verbose] [--hint <hint>] [--model <model>] [--count <count>]')
  console.log('Options:')
  console.log('  --model <model>  Use a specific model. Available models:')
  for (let i in models) {
    if (i === '0') {
      console.log(`    ${models[i]} (default)`)
    } else {
      console.log(`    ${models[i]}`)
    }
  }
  console.log('  --hint <hint>    Use a hint for the commit message')
  console.log('  --verbose        Print more information')
  console.log('  --count <count>  Generate multiple commit messages')
  console.log('  --old            Dont use chat model, use old model')
  console.log('  --gpt4           Use GPT-4 model')
  console.log('  --help           Print this help')
}


main(process.argv.slice(2));
  