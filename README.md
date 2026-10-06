# Customer Feedback Analysis Agent

A small local web app that analyzes customer comments with an Ollama model running on your computer. It assigns each comment one category, summarizes recurring themes, and lets you download the categorized data. The project also includes a command-line workflow for analyzing files in a folder.

## What it does

For each comment, the model chooses one category:

| Category | Use it for |
| --- | --- |
| **Bug** | A feature fails, returns an error, or behaves incorrectly. |
| **Feature Request** | The customer asks for a missing capability, option, or information. |
| **UI/UX Issue** | A flow, screen, or interaction feels confusing or difficult to use. |
| **Performance** | The customer reports slowness, lag, waiting, freezing, or an unresponsive app. |
| **Praise** | The customer expresses a positive experience without a stronger issue or request. |

The web report includes category counts, average rating, and five written summaries:

1. Major customer pain areas
2. What users wish the product had
3. Highest friction in the journey
4. Reported performance bottlenecks
5. Features customers love

Ratings are provided to the model as context. The app does not infer ratings from comment wording.

## Requirements

- Python 3.10 or later
- [Ollama](https://ollama.com/) installed and running locally
- An Ollama model pulled locally, such as `llama3.2:1b`
- `openpyxl` for Excel workbook uploads; CSV analysis uses the Python standard library

Install the model and Excel reader if needed:

```sh
ollama pull llama3.2:1b
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
python3 customer_feedback_web.py --model llama3.1:8b
python3 customer_feedback_web.py --host 127.0.0.1 --port 8080
```

The default model is `llama3.2:1b`. Choose another model only after pulling it with Ollama. The app binds to `127.0.0.1` by default, so it is available only from the same computer.

## Upload file format

Upload a `.csv`, `.xlsx`, or `.xlsm` file up to 20 MB. The header row must include these four columns:

```csv
Date,Country,rating,Comments
2026-01-15,Sweden,5,"Booking was quick and easy."
2026-01-16,Denmark,2,"The confirmation page took a long time to load."
```

Headers are matched without regard to letter case or spaces/punctuation. The web app also accepts `Score` or `Stars` for `rating`, and `Comment`, `Feedback`, `Review`, or `Text` for `Comments`. `Date` and `Country` are required for the web upload even though only rating and comment are used for model classification. Ratings must be whole numbers from 1 to 5. Rows with empty comments are skipped.

For Excel, each worksheet is checked for the required headers. Worksheets without a matching feedback table are ignored; rows from matching sheets are included. The downloaded CSV combines those rows and retains the input columns, adding `AI Category`.

## What happens during analysis

1. The browser uploads the chosen file to the local Python server.
2. The server validates the headers and ratings and skips blank comments.
3. Comments are sent in batches to Ollama on `http://localhost:11434` for categorization.
4. Representative classified comments and category counts are sent to Ollama for the five summaries.
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
python3 customer_feedback_agent.py --model llama3.1:8b
```

The command-line workflow recognizes common comment and rating headers and also supports the survey export columns described by the script. Excel input may require `openpyxl`. To rebuild a report from an existing `feedback_classified.csv` and reapply the local category rules without calling the model, use `--refresh-existing`.

## Troubleshooting

### The browser says the site cannot be reached

Start the server from the project directory with `python3 customer_feedback_web.py` and leave that terminal open. Check that the address is `http://127.0.0.1:8000`. If the port is already in use, pass another port, for example `--port 8080`, and open `http://127.0.0.1:8080`.

### Ollama cannot be reached or the model is missing

Open/start Ollama, then pull the selected model:

```sh
ollama pull llama3.2:1b
```

The app expects Ollama at `http://localhost:11434` by default. Set the `OLLAMA_URL` environment variable before starting the app if your local Ollama service uses another address.

### The workbook is not accepted

Use `.xlsx` or `.xlsm` for web uploads; legacy `.xls` files are not supported by the web interface. Check that the worksheet has `Date`, `Country`, `rating`, and `Comments` headers, with ratings as integers from 1 to 5.

### Excel support is unavailable

Install `openpyxl` in the same Python environment used to start the app:

```sh
python3 -m pip install openpyxl
```

## Project files

- `customer_feedback_web.py` — local browser interface and upload processing
- `customer_feedback_agent.py` — classification rules, Ollama calls, and command-line report generation
- `README.md` — setup and usage guide
- `.gitignore` — excludes local data, generated reports, and Python cache files from Git
