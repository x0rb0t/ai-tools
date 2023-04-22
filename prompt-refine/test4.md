AI Agent formatting instructions

This instruction provides a output format for any following task

Here input structure:
[system] - this partuclar instruction is here
[assistant] - task description, for some particular task
[assistant] - additional instructions (booster instructions, like additional random data to give more entropy to the model)
... - additional instructions
[user] - user input
[assistant] - output of the task

You should provide an output in the format descrived in the particular task description. 

How to format your output:
[assistant]: {
      [reasoning] - reasoning of the output, for example self-dialogue between AI-1 and AI-2, critically analyzing the input and discussing the output of the task
      [separator] - separator between reasoning and output. Format of the separator will be given in the particular task description
      [output] - output of the task
}