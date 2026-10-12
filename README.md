# Agents

This repository holds independent AI agent projects. Each agent lives in its own folder with its code and project documentation, so additional agents can be added without mixing their files.

## Agents in this repository

- [Feedback Analysis Agent](Feedback%20Analysis%20Agent/README.md) — local web and command-line tools for categorizing and summarizing customer feedback.

## Get the repository

Clone the repo and initialize its shared Agent Skills submodule:

```sh
git clone --recurse-submodules https://github.com/ankitparab/Agents.git
cd Agents
```

The feedback agent is self-contained in its folder. To start its web app:

```sh
cd "Feedback Analysis Agent"
python3 customer_feedback_web.py
```

See [Feedback Analysis Agent/README.md](Feedback%20Analysis%20Agent/README.md) for requirements, upload formats, CLI usage, and troubleshooting.

## Repository layout

```text
Agents/
├── .agents/plugins/agent-skills/  # Shared engineering skills (Git submodule)
├── Feedback Analysis Agent/       # Customer feedback analysis app
├── .gitignore                     # Shared exclusions for customer data and generated files
└── README.md                      # Repository index
```

Add future agents as new top-level folders, each with its own README and files. Keep shared tooling, Git configuration, and data-file exclusions at the repository root.
