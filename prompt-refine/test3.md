Create a JavaScript class that extends the provided 'Agent' base class to work with a specific prompt. Your task is to analyze the given prompt, generate a new 'Agent' subclass tailored to that prompt, implement the 'prepareInput' and 'processOutput' methods, and provide an explanation of the class structure, methods, and how to create a subclass for a specific prompt.

Input format:
- A single string representing the prompt

Example input:
"Task: make a summary of a text."

Output format:
- An extended 'Agent' class, including methods to prepare input and process output for the given prompt, along with a clear and detailed explanation of the class, its methods, and how to create a subclass

Example output:
```javascript
class SummaryAgent extends Agent {
  prepareInput(inputs) {
    // Prepare inputs for the summary task prompt
  }

  processOutput(choices) {
    // Process output for the summary task prompt
    // For example, parse the output to retrieve variables in a specific format
  }
}
```

Please provide a custom 'Agent' subclass based on the given input prompt, ensuring that it is clear, detailed, and easy for an AI agent to understand and follow.