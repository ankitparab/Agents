# Customer Feedback Analysis Agent

A small local web app that analyzes customer comments with an Ollama model running on your computer. It assigns each comment one category, summarizes recurring themes, and lets you download the categorized data. The project also includes a command-line workflow for analyzing files in a folder.

## What it does

For each comment, the model chooses one category:

| Category | Use it for |
| --- | --- |
| **Bug** | A feature fails, returns an error, or behaves incorrectly. |
| **Feature Request** | The customer asks for a missing capability, choice, option, or improvement, regardless of the product area. |
| **UI/UX Issue** | An existing screen or flow hides or fails to clearly show needed information, or feels confusing or difficult to use. |
| **Performance** | The customer reports slow response, lag, waiting, freezing, or unresponsiveness. For mixed comments, the model selects the main concern described by the customer. |
| **Praise** | The customer expresses a positive experience without a stronger issue or request. |

The report includes category counts, average rating, and four focused analyses:

1. Top five frustration-causing features or workflows from comments rated 1–3
2. Top three general types of requested improvement from comments containing “I wish,” “Hope you add,” or “Missing,” grouped by available user segment fields
3. General interaction or navigation friction patterns and recurring phrases in comments categorized as UI/UX Issue
4. Constructive feedback in ratings 4–5 comments that contain at least 25 words

The model categorizes each comment using the comment text and its rating as context. The rating does not override explicit comment content. Ratings are retained in the output and used to calculate the average. Summaries use the specified rating/category filters and available generic segment fields. Summary instructions avoid reproducing product-specific feature names, pricing details, named screens, and capability details, so the workflow can be reused with different products.

## Agent Skills

This repository includes [addyosmani/agent-skills](https://github.com/addyosmani/agent-skills) as a Git submodule at `.agents/plugins/agent-skills`. It provides reusable engineering workflows for AI coding agents. Clone the project with submodules enabled:

```sh
git clone --recurse-submodules https://github.com/ankitparab/Agents.git
```

If you already cloned the project, initialize the skill repository with:

```sh
git submodule update --init --recursive
```

The submodule is pinned to a specific upstream commit so project checkouts stay reproducible. To update it intentionally, run `git submodule update --remote .agents/plugins/agent-skills` and commit the resulting submodule change.

## Requirements

- Python 3.10 or later
- [Ollama](https://ollama.com/) installed and running locally
- An Ollama model pulled locally, such as `llama3.1:8b` (default)
- `openpyxl` for Excel workbook uploads; CSV analysis uses the Python standard library

Install the model and Excel reader if needed:

```sh
ollama pull llama3.1:8b
python3 -m pip install openpyxl
```

If you only plan to upload CSV files, you can skip the `openpyxl` install.

## Start the web app

From the project directory, run:

```sh
python3 customer_feedback_web.py
```

Then open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your browser. Keep the terminal process running while using the page. Press `Ctrl+C` in that terminal to stop the server.

Options:

```sh
python3 customer_feedback_web.py --model llama3.2:1b
python3 customer_feedback_web.py --host 127.0.0.1 --port 8080
```

The default model is `llama3.1:8b`, which uses more memory and runs more slowly than a 1B model. For faster, lower-resource runs, pull and select `llama3.2:1b`. Choose another model only after pulling it with Ollama. The app binds to `127.0.0.1` by default, so it is available only from the same computer.

## Upload file format

Upload a `.csv`, `.xlsx`, or `.xlsm` file up to 20 MB. The header row must include these four columns:

```csv
Rating,Comments
5,"The process was quick and easy."
2,"I had to wait a long time for the page to load."
```

Headers are matched without regard to letter case or spaces/punctuation. The web app accepts `Rating`, `Score`, `Stars`, `CSAT`, `CSAT Score`, `Customer Satisfaction`, or `Overall Satisfaction` for the score, and `Comment`, `Comments`, `Feedback`, `Review`, `Text`, `Message`, or `Response` for the customer text. Date and location fields are optional. Ratings must be whole numbers from 1 to 5. Rows with empty comments are skipped. Additional columns are retained, and generic segment fields such as country, market, user/customer segment, cohort, plan, role, or platform can be used to group requested improvements.

For Excel, each worksheet is checked for the required headers. Worksheets without a matching feedback table are ignored; rows from matching sheets are included. The downloaded CSV combines those rows and retains the input columns, adding `AI Category`.

## What happens during analysis

1. The browser uploads the chosen file to the local Python server.
2. The server validates the headers and ratings and skips blank comments.
3. Each comment and its rating are sent in batches to Ollama on `http://localhost:11434` for categorization. Model categories are not overridden by hard-coded phrase rules.
4. The four summary questions are analyzed from their matching comment subsets in chunks, using available segment fields for grouping.
5. The page shows progress, category totals, average rating, summaries, and a preview of up to 500 classified comments.
6. Choose **Download categorized CSV** to save every analyzed row and its category.

Only one upload is analyzed at a time. Uploads and job results are held in memory by the local server; stopping it clears them. The server does not save uploaded files to disk. Customer text is processed by the local Ollama service, not by a hosted model API.

## Command-line workflow

The command-line agent reads CSV or Excel files from `~/Downloads/Analysis`, creates `feedback_analysis.md` and `feedback_classified.csv` in that folder, and prints progress in the terminal:

```sh
python3 customer_feedback_agent.py
```

Use another input folder, report path, or local Ollama model with:

```sh
python3 customer_feedback_agent.py --input ~/Downloads/Analysis --output ~/Downloads/Analysis/report.md
python3 customer_feedback_agent.py --model llama3.2:1b
```

The command-line workflow recognizes common comment and rating headers and also supports the survey export columns described by the script. Excel input may require `openpyxl`. To rebuild a report from an existing `feedback_classified.csv` using its saved `AI Category` values, skipping category calls but still generating the four model summaries, use `--refresh-existing`. Run without that flag to classify comments again with the model.

## Troubleshooting

### The browser says the site cannot be reached

Start the server from the project directory with `python3 customer_feedback_web.py` and leave that terminal open. Check that the address is `http://127.0.0.1:8000`. If the port is already in use, pass another port, for example `--port 8080`, and open `http://127.0.0.1:8080`.

### Ollama cannot be reached or the model is missing

Open/start Ollama, then pull the selected model:

```sh
ollama pull llama3.1:8b
```

The app expects Ollama at `http://localhost:11434` by default. Set the `OLLAMA_URL` environment variable before starting the app if your local Ollama service uses another address.

### The workbook is not accepted

Use `.xlsx` or `.xlsm` for web uploads; legacy `.xls` files are not supported by the web interface. Check that the worksheet has a recognized rating/CSAT column and a recognized comment/feedback column, with ratings as integers from 1 to 5.

### Excel support is unavailable

Install `openpyxl` in the same Python environment used to start the app:

```sh
python3 -m pip install openpyxl
```

## Project files

- `customer_feedback_web.py` — local browser interface and upload processing
- `customer_feedback_agent.py` — category definitions, Ollama calls, and command-line report generation
- `README.md` — setup and usage guide
- `.gitignore` — excludes local data, generated reports, and Python cache files from Git
