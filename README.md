# AI console assistant tools

## Tools (list)
- git-ai-commit (helps to write commit messages)

## Requirements
export OPENAI_API_KEY=sk-...

## Installation
```
git clone
./install.sh git-ai-commit
```

## Usage
```
git-ai-commit [--verbose] [--hint <hint>] [--model <model>] [--count <count>]

```

## Examples
```
git-ai-commit --hint "Show examples of how to use the tool"
Message: "Add examples to README to show how to use the tool"
Is this a good message for the commit? [y/n]: n
Message: "Add examples of how to use git-ai-commit"
Is this a good message for the commit? [y/n]: 
```