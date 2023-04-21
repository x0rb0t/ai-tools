#!/usr/bin/env node
//Script to create a simple web server with a chatbot


const { Configuration, OpenAIApi } = require("openai");
const fs = require('fs')
const { randomBytes } = require("crypto");
const { Agent } = require('../common/agent')

//express
const express = require('express')
const app = express()
let port = 3000

//openai
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

const chatModels = [
  'gpt-3.5-turbo',
  'gpt-4',
]

class ChatAgent extends Agent {
  constructor(prompt, model = 'gpt-3.5-turbo', count = 1, max_tokens = 256, temperature = 0.8, top_p = 1) {
    super(openai, prompt, model, count, max_tokens, temperature, top_p)
  }

  processOutput(choices) {
    return choices.map((choice) => choice.text.trim())
  }
}