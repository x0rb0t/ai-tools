import { OpenAI } from "openai";
import * as fs from 'fs'
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import { flattenJSON, inflateJSON, chunkArray, flattenXML, inflateXML, inflateStrings, flattenStrings } from "./utils.js";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 20 * 1000,
});



const chatModels = [
  'gpt-3.5-turbo',
  'gpt-4',
]

const chatModel = chatModels[0]

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


// Utility function to process keyValues and manage API call
async function processKeyValues(model, keyValues, from, context, promptTemplate, actionDescription) {
  if (!LANG_MAP[from]) {
    throw new Error('Invalid language');
  }
  let prompt = promptTemplate.replace('%INPUT_LANG%', LANG_MAP[from]);
  if (context) {
    prompt = prompt.replace('%CONTEXT%', `${actionDescription} must be done in context of: '${context}'`);
  }
  const messages = [{"role": "system", "content": prompt}];
  let inputMessage = keyValues.map(({ key, value }) =>
    `${key} = ${value.replace(/\n/g, '\\n')}`
  ).join('\n');

  messages.push({"role": "user", "content": inputMessage});
  messages.push({"role": "user", "content": "Your output must exclusively contain the key-value pairs separated by new line."});

  const params = {
    model: model,
    n: 1,
    max_tokens: 2048,
    temperature: 0.7,
    top_p: 0.9,
    messages: messages,
  };
  const retryCount = 3;
  for (let i = 0; i < retryCount; i++) {
    try {
      const response = await openai.chat.completions.create(params);
      const { choices } = response;
      const { message } = choices[0];
      const lines = message.content.split('\n');
      return parseResponse(lines, keyValues);
    } catch (error) {
      if (i === retryCount - 1) {
        console.error(`Failed to process:`, keyValues);
        throw error;
      }
    }
  }
}

// Utility function to parse the API response
function parseResponse(lines, keyValues) {
  const translatedKeyValues = [];
  const originalKeySet = new Set(keyValues.map(({ key }) => key));
  const duplicateKeySet = new Set();

  lines.forEach(line => {
    const index = line.indexOf('=');
    if (index === -1) return;

    const key = line.substring(0, index).trim();
    if (!key || !originalKeySet.has(key) || duplicateKeySet.has(key)) return;

    duplicateKeySet.add(key);
    const value = line.substring(index + 1).trim();
    translatedKeyValues.push({ key, value });
  });

  if (translatedKeyValues.length !== originalKeySet.size) {
    console.error('Original keys:', originalKeySet);
    console.error('Translated keys:', new Set(translatedKeyValues.map(({ key }) => key)));
    throw new Error('Invalid response');
  }

  return translatedKeyValues;
}

// Refactored translate function
const translate = async (model, keyValues, from, to, context) => {
  if (!LANG_MAP[to]) {
    throw new Error('Invalid language');
  }
  return await processKeyValues(model, keyValues, from, context, PROMPT_TEMPLATE.replace('%OUTPUT_LANG%', LANG_MAP[to]), 'Translation');
};

// Refactored fixGrammar function
const fixGrammar = async (model, keyValues, from, context) => {
  return await processKeyValues(model, keyValues, from, context, FIX_GRAMMAR_PROMPT_TEMPLATE, 'Grammar fixing');
};



const argv = yargs(hideBin(process.argv))
  .scriptName("translate-js")
  .usage('$0 [options]')
  .option('input', {
    alias: 'i',
    describe: 'Path to the input JSON file',
    type: 'string',
    demandOption: true,
  })
  .option('from', {
    alias: 'f',
    describe: 'Source language',
    type: 'string',
    default: 'auto',
  })
  .option('to', {
    alias: 't',
    describe: 'Target language',
    type: 'string',
  })
  .option('context', {
    alias: 'c',
    describe: 'Context for translation',
    type: 'string',
  })
  .option('model', {
    alias: 'm',
    describe: 'OpenAI model for translation',
    type: 'string',
    default: chatModel,
    choices: chatModels,
  })
  .option('verbose', {
    alias: 'v',
    describe: 'Enable verbose output',
    type: 'boolean',
    default: false,
  })
  .option('output', {
    alias: 'o',
    describe: 'Path to save the translated JSON',
    type: 'string',
  })
  .option('chunk-size', {
    alias: 's',
    describe: 'Number of key-value pairs to process in each API call',
    type: 'number',
    default: 32,
  })
  .option('fix-grammar', {
    alias: 'g',
    describe: 'Fixes grammar without translating',
    type: 'boolean',
    default: false,
  })
  //input format - json/xml
  .option('format', {
    alias: 'if',
    describe: 'Input format',
    type: 'string',
    default: 'json',
    choices: ['json', 'xml', 'strings'],
  })
  .option('dry-run', {
    describe: 'Simulates translation without calling OpenAI API',
    type: 'boolean',
    default: false,
  })
  .help()
  .alias('help', 'h')
  .check((argv) => {
    if (!argv.fixGrammar && !argv.to) {
      throw new Error('Missing --to argument');
    }
    return true;
  })
  .argv;
  

// Utility function for verbose logging
function logVerboseInfo(argv, mode) {
  const { input, from, to, context, model, verbose } = argv;
  if (verbose) {
    console.log(mode === 'fixGrammar' ? `Fixing grammar for ${input} (${from})` : `Translating ${input} from ${from} to ${to}`);
    if (context) {
      console.log(`Context: ${context}`);
    }
    console.log(`Model: ${model}`);
  }
}

// Function to process chunks
async function processChunks({ model, from, to, context, chunkedKeyValues, fixGrammarMode, verbose }) {
  const outputFlattenedJSON = {};
  for (let i = 0; i < chunkedKeyValues.length; i++) {
    const chunk = chunkedKeyValues[i];
    let translatedChunk = fixGrammarMode
      ? await fixGrammar(model, chunk, from, context)
      : await translate(model, chunk, from, to, context);

    translatedChunk.forEach(({ key, value }) => {
      outputFlattenedJSON[key] = value;
    });

    if (verbose) {
      console.log(`Processed ${i + 1} / ${chunkedKeyValues.length} chunks`);
    }
  }
  return outputFlattenedJSON;
}

const main = async (argv) => {
  const { input, from, to, context, model, verbose, output, chunkSize, fixGrammar, dryRun, format } = argv;

  logVerboseInfo(argv, fixGrammar ? 'fixGrammar' : 'translate');

  // Read and parse file
  const data = fs.readFileSync(input, 'utf8');

  let keyValues = [];
  let reconstructData = data;
  if (format === 'json') {
    const json = JSON.parse(data);
    const flattenedJSON = flattenJSON(json);
    keyValues = Object.entries(flattenedJSON).map(([key, value]) => ({ key, value }));
  } else if (format === 'xml') {
    const { result, parsedXml } = await flattenXML(data);
    keyValues = Object.entries(result).map(([key, value]) => ({ key, value }));
    reconstructData = parsedXml;
  } else if (format === 'strings') {
    //flattenStrings
    const result = flattenStrings(data);
    keyValues = Object.entries(result).map(([key, value]) => ({ key, value }));
  } else {
    throw new Error('Invalid input format');
  }

  let outputFlattenedJSON;
  if (!dryRun) {
    const chunkedKeyValues = chunkArray(keyValues, chunkSize);
    outputFlattenedJSON = await processChunks({
      model,
      from,
      to,
      context,
      chunkedKeyValues,
      fixGrammar,
      verbose
    });
  } else {
    outputFlattenedJSON = keyValues.reduce((acc, { key, value }) => {
      acc[key] = value;
      return acc;
    }, {});
  }

  // Inflate the JSON
  if (format === 'json') {
    const outputJSON = inflateJSON(outputFlattenedJSON);
    if (output) {
      if (!dryRun) {
        fs.writeFileSync(output, JSON.stringify(outputJSON, null, 2));
      }
    } else {
      console.log(JSON.stringify(outputJSON, null, 2));
    }
  } else if (format === 'xml') {
    const outputXML = await inflateXML(outputFlattenedJSON, reconstructData); 
    if (output) {
      if (!dryRun) {
        fs.writeFileSync(output, outputXML);
      }
    } else {
      console.log(outputXML);
    }
  } else if (format === 'strings') {
    const outputStrings = inflateStrings(outputFlattenedJSON);
    if (output) {
      if (!dryRun) {
        fs.writeFileSync(output, outputStrings);
      }
    } else {
      console.log(outputStrings);
    }
  }
};

main(argv)




