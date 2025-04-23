# London Crime Dashboard

## Project Description

This web application provides an interactive visualization of London crime data from 2014-2024. It features:
* An interactive choropleth map showing crime distribution across boroughs.
* Filters to view data by different crime types.
* Trend charts displaying overall crime patterns over time.
* Analysis of crime data in relation to COVID-19 lockdown phases using a radial bar chart.
* Detailed monthly crime trend charts for individual boroughs (accessible via map click).

## Prerequisites

* Python 3.7+
* `pip` (Python package installer)

## Setup and Installation

1.  **Clone the Repository (or Download Files):**
    If applicable, clone the repository from GitHub. Otherwise, ensure you have the complete project folder.
    ```bash
    # Example if using Git:
    # git clone <repository-url>
    # cd <repository-folder-name>
    ```
    Navigate into the main project directory in your terminal or command prompt.

2.  **Create a Virtual Environment:**
    It is highly recommended to use a virtual environment to manage dependencies.
    * On macOS/Linux:
        ```bash
        python3 -m venv venv
        ```
    * On Windows:
        ```bash
        python -m venv venv
        ```
    *(This creates a folder named `venv` in your project directory.)*

3.  **Activate the Virtual Environment:**
    * On macOS/Linux:
        ```bash
        source venv/bin/activate
        ```
    * On Windows (Command Prompt):
        ```bash
        venv\Scripts\activate.bat
        ```
    * On Windows (PowerShell):
        ```bash
        venv\Scripts\Activate.ps1
        ```
    *(You should see `(venv)` appear at the beginning of your terminal prompt.)*

4.  **Install Required Packages:**
    Install all the necessary Python libraries listed in the `requirements.txt` file.
    ```bash
    pip install -r requirements.txt
    ```
    *(Make sure your `requirements.txt` file accurately lists libraries like `Flask`, `pandas`, etc.)*

## Running the Application

1.  **Run the Flask App:**
    Execute the main Flask application script (assuming it's named `app.py` - **change if your file has a different name**).
    ```bash
    flask run
    ```
    *Alternatively, you might run it directly using:*
    ```bash
    python app.py
    ```
    *(Check the output in the terminal. It should indicate the server is running, usually on `http://127.0.0.1:5000/` or `http://localhost:5000/`.)*

2.  **Access in Browser:**
    Open your web browser and navigate to the local address provided in the terminal (typically `http://127.0.0.1:5000/`).

3.  **Stopping the App:**
    Go back to the terminal where the app is running and press `Ctrl + C`.

## File Structure (Overview)