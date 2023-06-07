#!/usr/bin/env node
//Script to refine an OpenAI prompt using the OpenAI API
//Input: a prompt file (ex. prompt.md or prompt.txt), optional goal (def. "Improve and expand the prompt")

const { Configuration, OpenAIApi } = require("openai");
const fs = require('fs')
const { randomBytes } = require("crypto");
const { Agent } = require('../common/agent')

const GOLDEN_RATIO_INV = 0.618033988749895
const TEMPERATURE = GOLDEN_RATIO_INV //0.8
const TOP_P = GOLDEN_RATIO_INV // 0.95
//readline
const readline = require('readline').createInterface({
  input: process.stdin,
  output: process.stdout
})

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);


const chatModels = [
  'gpt-3.5-turbo',
  'gpt-4',
]

//class RefineAgent
class RefineAgent extends Agent {
  constructor(prompt, booster, entropy, model = 'gpt-3.5-turbo', count = 1, max_tokens = 256, temperature = TEMPERATURE, top_p = TOP_P) {
    super(openai, prompt, model, count, max_tokens, temperature, top_p)
    this.booster = booster
    this.entropy = entropy
  }

  //create from a prompt file (it is near the script, prompt-refine.md)
  static createFromFile(model, count = 1, max_tokens = 256, temperature = TEMPERATURE, top_p = TOP_P) {
    const data = fs.readFileSync(__dirname + '/prompt-refine.md', 'utf8')
    const booster = fs.readFileSync(__dirname + '/prompt-refine-booster.md', 'utf8')
    const entropy = fs.readFileSync(__dirname + '/../common/prompt-entropy.md', 'utf8')
    return new RefineAgent(data, booster, entropy, model, count, max_tokens, temperature, top_p)
  }


  //step 1. perform initial prompt
  async process(original, refine_prompts, objective) {
    const prompts = [{
      text: original,
      type: "original",
    }].concat(refine_prompts.map((refine_prompt) => ({
      text: refine_prompt,
      type: "variant",
    })))
    const input_format = {
      prompts: prompts,
      objective: objective,
    }
    const separator = `#OUTPUT_${randomBytes(8).toString('hex')}_SEPARATOR#`
    const booster_prepared = this.booster.replace(/%SEPARATOR%/g, `*${separator}*:`)
    const randString = randomBytes(128).toString('hex').match(/.{1,4}/g).join(' ')
    const entropy_prepared = this.entropy.replace(/%RANDOM_HEX_STRING%/g, randString)
    const inputs = [
      entropy_prepared,
      `#HERE INPUT FOR THE TASK#:\n${JSON.stringify(input_format, null, 2)}`,
      booster_prepared,
    ]
    const outputs = await this.run(inputs)
    const updated = outputs.map((output) => {
      const output_start = output.search(new RegExp(`\\*?${separator}\\*?:?\\s?`))
      if (output_start === -1) {
        console.error(`error: could not find output in the output of the prompt`)
        return null
      }
      //return everything after *HERE IS THE FINAL OUTPUT*:
      const output_end = output.length
  
      const reasoning_text = output.substring(0, output_start)
      const output_text = output.substring(output_start, output_end)
      //remove first line
      const output_lines = output_text.split('\n')
      output_lines.shift()
      const output_text_clean = output_lines.join('\n')
      return { reasoning: reasoning_text, output: output_text_clean }

    }).filter((updated) => updated !== null)
    return updated
  }
}

class CompareAgent extends Agent {
  constructor(prompt, booster, entropy, model = 'gpt-3.5-turbo', count = 1, max_tokens = 256, temperature = TEMPERATURE, top_p = TOP_P) {
    super(openai, prompt, model, count, max_tokens, temperature, top_p)
    this.booster = booster
    this.entropy = entropy
  }

  //create from a prompt file (it is near the script, prompt-compare.md)
  static createFromFile(model, count = 1, max_tokens = 256, temperature = TEMPERATURE, top_p = TOP_P) {
    const data = fs.readFileSync(__dirname + '/prompt-compare.md', 'utf8')
    const booster = fs.readFileSync(__dirname + '/prompt-refine-booster.md', 'utf8')
    const entropy = fs.readFileSync(__dirname + '/../common/prompt-entropy.md', 'utf8')
    return new CompareAgent(data, booster,entropy,  model, count, max_tokens, temperature, top_p)
  }

  
  async process(compare_prompts) {
    const prompts = compare_prompts.map((compare_prompt, index) => ({
      prompt_id: index,
      prompt: compare_prompt,
    }))
    const separator = `#OUTPUT_${randomBytes(8).toString('hex')}_SEPARATOR#`
    const booster_prepared = this.booster.replace(/%SEPARATOR%/g, `*${separator}*:`)
    const randString = randomBytes(128).toString('hex').match(/.{1,4}/g).join(' ')
    const entropy_prepared = this.entropy.replace(/%RANDOM_HEX_STRING%/g, randString)
    const inputs = [
      entropy_prepared,
      `#HERE INPUT FOR THE TASK#:\n${JSON.stringify(prompts, null, 2)}`,
      booster_prepared,
    ]
    const outputs = await this.run(inputs)
    //find '```'/'```json` blocks in the outputs
    const updated = outputs.map((output) => {
      const output_start = output.search(new RegExp(`\\*?${separator}\\*?:?\\s?`))
      if (output_start === -1) {
        console.error(`error: could not find output in the output of the prompt`)
        return null
      }
      //return everything after *HERE IS THE FINAL OUTPUT*:
      const output_end = output.length
      
      const reasoning_text = output.substring(0, output_start)
      const output_text = output.substring(output_start, output_end)
      //remove first line
      const output_lines = output_text.split('\n')
      output_lines.shift()
      const output_text_clean = output_lines.join('\n')
      return { reasoning: reasoning_text, output: output_text_clean }

    }).filter((updated) => updated !== null).map((updated) => {
      //parse the output
      //remove all lines starting ```
      const output_lines = updated.output.split('\n')
      const output_lines_clean = output_lines.filter((line) => !line.startsWith('```'))
      const output_text_clean = output_lines_clean.join('\n')
      //parse json
      try {
        const output_json = JSON.parse(output_text_clean)
        return { reasoning: updated.reasoning, output: output_json }
      } catch (e) {
        console.error(`error: could not parse output as json`)
        return null
      }
    }).filter((updated) => updated !== null)
    return updated
  }
}

const DEFAULT_OBJECTIVE = 'Please enhance the clarity and effectiveness of the prompt, ensuring that it is easily understandable for an AI agent. Additionally, if necessary, expand or condense the prompt to provide a more detailed explanation of the task.'
const objectives = {
  'default': `Please enhance the clarity and effectiveness of the prompt, ensuring that it is easily understandable for an AI agent.
  Additionally, if necessary, expand or condense the prompt to provide a more detailed explanation of the task.`,
  'clarity': `Please enhance the clarity and effectiveness of the prompt, ensuring that it is easily understandable for an AI agent.`,
  'expand': `Please expand the prompt to provide a more detailed explanation of the task.`,
  'condense': `Please condense the prompt to provide a more concise explanation of the task.`,
  'rethink': `Please paraphrase the prompt to provide a more effective explanation of the task.`,
  'examples': `Please provide examples of the task to provide a more effective explanation of the task.`,
  'adv': `Please enhance the clarity and effectiveness of the prompt, add/modify examples, paraphrase if required, ensuring that it is easily understandable for an AI agent.`,
}

async function main(argv) {
  if (argv.includes('--help')) {
    print_usage()
    process.exit(0)
    return
  }
  const input = argv.includes('--input') ? argv[argv.indexOf('--input') + 1] : null
  const rays = argv.includes('--rays') ? parseInt(argv[argv.indexOf('--rays') + 1]) : 2
  if (rays < 1 || rays > 10 || isNaN(rays)) {
    console.error('error: rays must be between 1 and 10')
    process.exit(0)
    return
  }
  const verbose = argv.includes('--verbose')
  let model = argv.includes('--model') ? argv[argv.indexOf('--model') + 1] : 'gpt-4'
  if (!chatModels.includes(model)) {
    console.error(`error: model ${model} is not supported`)
    process.exit(0)
    return
  }
  //get goal
  var objective = argv.includes('--objective') ? argv[argv.indexOf('--objective') + 1] : DEFAULT_OBJECTIVE

  // objective by code
  if (objective in objectives) {
    objective = objectives[objective]
  }

  if (process.env.OPENAI_API_KEY === undefined) {
    console.error('Please set OPENAI_API_KEY environment variable')
    process.exit(0)
    return
  }
  if (verbose) {
    console.log(`Using model: ${model}`)
    //print goal
    console.log(`Objective: ${objective}`)

    //print input
    console.log(`Input: ${input}`)

    //print rays
    console.log(`Rays: ${rays}`)
  }

  const refineAgent = RefineAgent.createFromFile(model, rays, 2048, 0.8)
  const compareAgent = CompareAgent.createFromFile(model, rays, 2048, 0.8)
  const target = Agent.createFromFile(openai, input, model)
  console.log(target.prompt)
  
  var variants = []
  let funcStep1 = null
  let funcStep2 = null
  funcStep1 = async (action) => {
    if (action !== 'y') {
      console.log('Exiting...')
      process.exit(0)
    }
    console.log('Refining prompt...')
    const result = await refineAgent.process(target.prompt, variants, objective)
    
    console.log('Refined prompt:')
    for (let i in result) {
      console.log("=====================================")
      console.log(`Reasoning ${i}:\n${result[i].reasoning}`)
      console.log(`Output ${i}:\n${result[i].output}`)
      console.log("=====================================")
    }
    if (result.length === 0) {
      //console.log('No output, exiting...')
      readline.question('No output, do you wish to try again? (y/n): ', funcStep1)
      return
    }
    variants = result.map((r) => r.output)
    readline.question('Do you wish to select the best variant or refine with new variants? (y/r/n): ', (action) => {
      if (action.startsWith('r')) {
        //if string is "r\snew objective"
        const split = action.split(' ')
        if (split.length > 1) {
          objective = split.slice(1).join(' ')
          if (objective in objectives) {
            objective = objectives[objective]
          }
          console.log(`New objective: ${objective}`)
        }
        funcStep1('y')
      } else {
        funcStep2(action)
      }
    })
  }
  funcStep2 = async (action) => {
    if (action !== 'y') {
      console.log('Exiting...')
      process.exit(0)
    }
    console.log('Selecting best variant...')
    const inputs = variants.concat(target.prompt)
    const result = await compareAgent.process(inputs)

    console.log('Best variant outputs(s):')
    for (let i in result) {
      console.log("=====================================")
      console.log(`Reasoning ${i}:\n${result[i].reasoning}`)
      console.log(`Output ${i}:\n${JSON.stringify(result[i].output)}`)
      console.log("=====================================")
    }
    const ratings = inputs.map (() => 0)
    for (let i in result) {
      for (let j in inputs) {
        if (j == result[i].output.best_prompt_id) {
          const number = parseFloat(result[i].output.weighted_average_score)
          if (isNaN(number)) {
            console.error(`error: could not parse weighted_average_score as a number`)
          } else {
            ratings[j] += number
          }
        }
      }
    }
    const variants_combined = []
    const original_id = variants.length
    for (let i in inputs) {
      if (i == original_id) {
        variants_combined.push({variant: inputs[i], rating: ratings[i], original: true, id: i})
      } else {
        variants_combined.push({variant: inputs[i], rating: ratings[i], original: false, id: i})
      }
    }

    //sort by rating, starting with the worst
    variants_combined.sort((a, b) => a.rating - b.rating)
    console.log('Best variants: (from worst to best)')
    for (let i in variants_combined) {
      if (variants_combined[i].original) {
        console.log("==============ORIGINAL==============")
        console.log(`Original variant (#${variants_combined[i].id}):\n${variants_combined[i].variant}`)
        console.log(`Rating: ${variants_combined[i].rating}`)
        console.log("=====================================")
      } else {
        console.log("=====================================")
        console.log(`Variant #${variants_combined[i].id}:\n${variants_combined[i].variant}`)
        console.log(`Rating: ${variants_combined[i].rating}`)
        console.log("=====================================")
      }
    }
    //filter out the worst variants and remove the original variant
    const variants_filtered = variants_combined.filter((v) => v.rating > 0 && !v.original)
  
    if (variants_filtered.length === 0) {
      console.log('No variants left, exiting...')
      readline.question('Do you wish to try again ? (y/n): ', funcStep2)
    }
    const max_count = Math.ceil(rays*1.5)
    if (variants_filtered.length > max_count) {
      console.log(`Too many variants left, only keeping the ${max_count} best ones`)
      variants_filtered.splice(max_count)
    }
    variants = variants_filtered.map((v) => v.variant)
    readline.question('Do you wish to interate again ? (y/n): ', action => {
      if (action.startsWith('y')) {
        const split = action.split(' ')
        if (split.length > 1) {
          objective = split.slice(1).join(' ')
          if (objective in objectives) {
            objective = objectives[objective]
          }
          console.log(`New objective: ${objective}`)
        }
        funcStep1('y')
      } else {
        console.log('Exiting...')
        process.exit(0)
      }
    })
  }
  
  funcStep1('y')
  
}


function print_usage() {
  console.log('Usage: node refine.js [--help] [--verbose] [--model <model>] [--objective <objective>] [--rays <rays>] --input <input>')
  console.log('  --help: print this help message')
  console.log('  --verbose: print more information')
  console.log('  --model: specify the model to use (default: gpt-4)')
  console.log('  --objective: specify the objective to use (default: "' + DEFAULT_OBJECTIVE + '")')
  console.log('  --input: specify the input file to use')
  
}


main(process.argv.slice(2));
  