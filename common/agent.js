
const fs = require('fs')
class Agent {
  constructor(openai, prompt, model = 'gpt-3.5-turbo', count = 1, max_tokens = 256, temperature = 0.8, top_p = 1) {
    this.openai = openai
    this.prompt = prompt
    this.model = model
    this.count = count
    this.max_tokens = max_tokens
    this.temperature = temperature
    this.top_p = top_p
  }

  //static function to load from a prompt file
  static createFromFile(openai, path, model, count = 1, max_tokens = 256, temperature = 0.8, top_p = 1) {
    //read the file
    const data = fs.readFileSync(path, 'utf8')
    return new Agent(openai, data, model, count, max_tokens, temperature, top_p)
  }
  
  //function to prepare input data to the prompt
  prepareInput(inputs) {
    return [{
        role: 'system',
        content: this.prompt,
      }, ...inputs.map(input => {
        if (typeof input === 'string') {
          return {
            role: 'user',
            content: input,
          }
        } else if (typeof input === 'object') {
          return {
            role: input.role,
            content: input.content,
          }
        } else {
          throw new Error('Invalid input type')
        }
      })]
  }

  //virtual function to process the output of the prompt
  //throw RetryError to retry the prompt
  processOutput(choices) {
    return choices.map((choice) => choice.message.content.trim())
  }

  //virtual function to get aopeai arguments
  getOpenAIArgs() {
    return {
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.max_tokens,
      top_p: this.top_p,
      n: this.count,
    }
  }

  //function to run the prompt
  //inputs: array of strings
  //returns: array of strings
  async run(inputs) {
    const input = this.prepareInput(inputs)
    const params = this.getOpenAIArgs()
    params.messages = input
    const response = await this.openai.createChatCompletion(params)
    const output = this.processOutput(response.data.choices)
    return output
  }
}
exports.Agent = Agent