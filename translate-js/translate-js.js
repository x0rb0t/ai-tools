import { OpenAI } from "openai";
import * as fs from 'fs'
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});



const chatModels = [
  'gpt-3.5-turbo',
  'gpt-4',
]

const chatModel = chatModels[0]

const flattenJSON = (data, prefix = '') => {
  let result = {};
  if (Array.isArray(data)) {
    data.forEach((value, index) => {
      const newKey = `${prefix}.[${index}]`;
      if (typeof value === 'object' && value !== null) {
        result = { ...result, ...flattenJSON(value, newKey) };
      } else {
        result[newKey] = value;
      }
    });
  } else {
    for (let key in data) {
      const escapedKey = key.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
      const newKey = prefix ? `${prefix}.${escapedKey}` : escapedKey;
      const value = data[key];
      if (typeof value === 'object' && value !== null) {
        result = { ...result, ...flattenJSON(value, newKey) };
      } else {
        result[newKey] = value;
      }
    }
  }
  return result;
};


const inflateJSON = (data) => {
  let result = {};
  for (let key in data) {
    let value = data[key];
    let keys = key.split('.').map(k => k.replace(/\\[\[\]]/g, match => match[1]));
    let temp = result;
    for (let i = 0; i < keys.length; i++) {
      let nextKey = keys[i];
      let isArrayIndex = /^\[\d+\]$/.test(nextKey);
      let actualKey = isArrayIndex ? parseInt(nextKey.match(/\[(\d+)\]/)[1], 10) : nextKey;
      let isLastElement = i === keys.length - 1;

      if (isArrayIndex && !Array.isArray(temp)) {
        temp = [];
      }

      if (isLastElement) {
        temp[actualKey] = value;
      } else {
        if (temp[actualKey] === undefined) {
          temp[actualKey] = /^\[\d+\]$/.test(keys[i + 1]) ? [] : {};
        }
        temp = temp[actualKey];
      }
    }
    result = Array.isArray(result) ? Object.values(result) : result;
  }
  return result;
};




const LANG_MAP = {
  'en': 'English',
  'de': 'German',
  'es': 'Spanish',
  'fr': 'French',
  'it': 'Italian',
  'ja': 'Japanese',
  'ko': 'Korean',
  'pt': 'Portuguese',
  'ru': 'Russian',
  'zh': 'Chinese',
  'auto': 'Auto-Detect'
}

const PROMPT_TEMPLATE = `
TASK: Translate the values of key-value pairs from %INPUT_LANG% to %OUTPUT_LANG%
Objective: You are provided with a list of key-value pairs in the %INPUT_LANG% language. 
Your task is to translate ONLY the values to the %OUTPUT_LANG% language, keeping the keys intact. 
The output should be formatted exactly like the input, with key-value pairs separated by new lines and maintaining the same order as the input. The number of output key-value pairs must be equal to the number of input key-value pairs.
Example:
Input: 
home.title = Casa
home.description = Esta es una casa
Output: 
home.title = Home
home.description = This is a home
%CONTEXT%
`;

const FIX_GRAMMAR_PROMPT_TEMPLATE = `
TASK: Correct the grammar in the values of given key-value pairs.
Objective: You are given a list of key-value pairs in the %INPUT_LANG% language. Your task is to correct any grammatical errors in the values, while leaving the keys untouched. 
Format: The output should be formatted exactly like the input, with each key-value pair on a new line and in the same order as the input. The number of output key-value pairs should match the number of input key-value pairs. Be sure to preserve the case of the input values, as this is crucial for the task.
Example:
Input:
home.title = Home pgae
home.description = This is home
Output:
home.title = Home page
home.description = This is a home
%CONTEXT%
`;


const translate = async (model, keyValues, from, to, context) => {
  const params = {
    model: model,
    n: 1,
    max_tokens: 1024,
    temperature: 0.7,
    top_p: 0.9,
  }
  if (!LANG_MAP[from]) {
    throw new Error('Invalid language')
  }
  if (!LANG_MAP[to]) {
    throw new Error('Invalid language')
  }
  let prompt = PROMPT_TEMPLATE
    .replace('%INPUT_LANG%', LANG_MAP[from])
    .replace('%OUTPUT_LANG%', LANG_MAP[to])
  if (context) {
    prompt = prompt.replace('%CONTEXT%', `Translation must be done in context of: '${context}'`)
  }
  const messages = [ {"role": "system", "content": prompt } ]
  let input_message = ""
  for (let i = 0; i < keyValues.length; i++) {
    const { key, value } = keyValues[i]
    //escape new line characters
    const escapedValue = value.replace(/\n/g, '\\n')
    input_message += `${key} = ${escapedValue}\n`
  }
  messages.push({"role": "user", "content": input_message})
  messages.push({"role": "user", "content": "Your output must exclusively contain the translated key-value pairs separated by new line."})
  params.messages = messages
  const response = await openai.chat.completions.create(params)
  const { choices } = response
  //console.log(choices)
  const { message } = choices[0]
  //split by new line
  const lines = message.content.split('\n')
  const translatedKeyValues = []
  const originalKeySet = new Set(keyValues.map(({ key }) => key))
  const duplicateKeySet = new Set()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    //index of '='
    const index = line.indexOf('=')
    if (index === -1) {
      //skip this line
      continue
    }
    const key = line.substring(0, index).trim()
    if (!key || !originalKeySet.has(key)) {
      continue
    }
    if (duplicateKeySet.has(key)) {
      continue
    }
    duplicateKeySet.add(key)
    const value = line.substring(index + 1).trim()
    if (value) {
      translatedKeyValues.push({ key, value })
    }
  }
  if (translatedKeyValues.length !== originalKeySet.size) {
    throw new Error('Invalid response')
  }
  return translatedKeyValues
}

const fixGrammar = async (model, keyValues, from, context) => {
  const params = {
    model: model,
    n: 1,
    max_tokens: 1024,
    temperature: 0.7,
    top_p: 0.9,
  }
  if (!LANG_MAP[from]) {
    throw new Error('Invalid language')
  }
  let prompt = FIX_GRAMMAR_PROMPT_TEMPLATE
    .replace('%INPUT_LANG%', LANG_MAP[from])
  if (context) {
    prompt = prompt.replace('%CONTEXT%', `Grammar must be fixed in context of: '${context}'`)
  }
  const messages = [ {"role": "system", "content": prompt } ]
  let input_message = ""
  for (let i = 0; i < keyValues.length; i++) {
    const { key, value } = keyValues[i]
    //escape new line characters
    const escapedValue = value.replace(/\n/g, '\\n')
    input_message += `${key} = ${escapedValue}\n`
  }
  messages.push({"role": "user", "content": input_message})
  messages.push({"role": "user", "content": "Your output must exclusively contain the translated key-value pairs separated by new line."})
  params.messages = messages
  const response = await openai.chat.completions.create(params)
  const { choices } = response
  //console.log(choices)
  const { message } = choices[0]
  //split by new line
  const lines = message.content.split('\n')
  const translatedKeyValues = []
  const originalKeySet = new Set(keyValues.map(({ key }) => key))
  const duplicateKeySet = new Set()
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    //index of '='
    const index = line.indexOf('=')
    if (index === -1) {
      //skip this line
      continue
    }
    const key = line.substring(0, index).trim()
    if (!key || !originalKeySet.has(key)) {
      continue
    }
    if (duplicateKeySet.has(key)) {
      continue
    }
    duplicateKeySet.add(key)
    const value = line.substring(index + 1).trim()
    if (value) {
      translatedKeyValues.push({ key, value })
    }
  }
  if (translatedKeyValues.length !== originalKeySet.size) {
    throw new Error('Invalid response')
  }
  return translatedKeyValues
}

const printHelp = () => {
  console.log(`
Usage:
  translate-js [OPTIONS]

Description:
  Translates a JSON file from one language to another using OpenAI's language models. Can also fix grammar in the JSON file.

Options:
  --input <path>            Path to the input JSON file. [Required]
  --from <lang>             Source language. Auto-detected if not specified.
  --to <lang>               Target language. Required unless --fix-grammar is used.
  --context <context>       Context for translation. [Optional]
  --model <model>           OpenAI model for translation. Default: gpt-3.5-turbo
  --verbose                 Enable verbose output.
  --output <path>           Path to save the translated JSON. Defaults to stdout.
  --chunk-size <size>       Number of key-value pairs to process in each API call. Default: 32
  --fix-grammar             Fixes grammar without translating. Cannot be used with --to.
  --dry-run                 Simulates translation without calling OpenAI API.
  --help                    Show this help message and exit.

Examples:
  translate-js --input en.json --from en --to de --output de.json
  translate-js --input en.json --fix-grammar --output en_fixed.json

Note:
  Make sure to set the OPENAI_API_KEY environment variable before running the command.

  `);
};




const main = async (argv) => {
  //parse argv
  // --file en.json --from en --to de --context "This is a DEX wallet app" --model gpt-3.5-turbo
  let input, from, to, context, verbose, output, chunkSize = 32, fixGrammarMode = false, dryRun = false
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--input') {
      input = argv[i + 1]
      i += 1
    } else if (arg === '--from') {
      from = argv[i + 1]
      i += 1
    } else if (arg === '--to') {
      to = argv[i + 1]
      i += 1
    } else if (arg === '--context') {
      context = argv[i + 1]
      i += 1
    } else if (arg === '--model') {
      chatModel = argv[i + 1]
      i += 1
    } else if (arg === '--verbose') {
      verbose = true
    } else if (arg === '--output') {
      output = argv[i + 1]
      i += 1
    } else if (arg === '--chunk-size') {
      chunkSize = parseInt(argv[i + 1], 10)
      i += 1
    } else if (arg === '--fix-grammar') {
      fixGrammarMode = true
    } else if (arg === '--dry-run') {
      dryRun = true
    } else if (arg === '--help') {
      printHelp()
      return
    } else {
      printHelp()
      throw new Error(`Invalid argument: ${arg}`)
    }
  }
  if (isNaN(chunkSize)) {
    printHelp()
    throw new Error('Invalid chunk size')
  }
  if (!input) {
    printHelp()
    throw new Error('Missing --input argument')
  }
  if (!from) {
    from = 'auto'
  }
  if (!to && !fixGrammarMode) {
    printHelp()
    throw new Error('Missing --to argument')
  }
  if (verbose) {
    if (fixGrammarMode) {
      console.log(`Fixing grammar for ${input} (${from})`)
    } else {
      console.log(`Translating from ${input} from ${from} to ${to}`)
    }
    if (context) {
      console.log(`Context: ${context}`)
    }
    console.log(`Model: ${chatModel}`)
  }

  //read file
  const data = fs.readFileSync(input, 'utf8')
  const json = JSON.parse(data)
  const flattenedJSON = flattenJSON(json)
  const keyValues = []
  for (let key in flattenedJSON) {
    keyValues.push({ key, value: flattenedJSON[key] })
  }
  //make a copy of the original keyValues
  const outputFlattenedJSON = { ...flattenedJSON }
  //split into chunks
  const chunkedKeyValues = []
  for (let i = 0; i < keyValues.length; i += chunkSize) {
    chunkedKeyValues.push(keyValues.slice(i, i + chunkSize))
  }
  //translate chunk by chunk
  if (!dryRun) {
    for (let i = 0; i < chunkedKeyValues.length; i++) {
      const chunk = chunkedKeyValues[i]
      let translatedChunk 
      if (fixGrammarMode) {
        translatedChunk = await fixGrammar(chatModel, chunk, from, context)
      } else {
        translatedChunk = await translate(chatModel, chunk, from, to, context)
      } 
      for (let j = 0; j < translatedChunk.length; j++) {
        const { key, value } = translatedChunk[j]
        outputFlattenedJSON[key] = value
      }
      if (verbose) {
        console.log(`Processed ${i + 1} / ${chunkedKeyValues.length} chunks`)
      }
    }
  }
  //inflate the json
  const outputJSON = inflateJSON(outputFlattenedJSON)
  
  if (output) {
    fs.writeFileSync(output, JSON.stringify(outputJSON, null, 2))
  } else {
    console.log(JSON.stringify(outputJSON, null, 2))
  }
}

main(process.argv.slice(2))




