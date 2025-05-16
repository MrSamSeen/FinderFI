[![SamSeen Logo](https://img.shields.io/badge/FinderFI-by_SamSeen_Solutions-orange?style=for-the-badge)](https://github.com/MrSamSeen)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

# FinderFI - Local Network File Access Server

FinderFI is a simple Node.js Express server designed to allow access to files on a host machine (like a laptop or PC) from any other device connected to the same Wi-Fi network.

## Why I Built This

This project was initially created for my personal use. I often need to access files on my MacBook from my Android phone. While solutions like AirDrop exist, they don't quite fit my workflow for accessing a broader range of files seamlessly across different operating systems. FinderFI makes it easy to browse and download any file from my MacBook on any device connected to my local network.

For example, since I'm using an Android phone and a MacBook, I can't use something like AirDrop for easy file transfers between them. With this server, it's even easier because I have access to all of my MacBook's files from any device I have connected to my home Wi-Fi.

I'm sharing this online because I believe others might find it useful for similar situations.

## Current Features

*   Browse directories and files on the host machine.
*   View images and videos directly in the browser.
*   Download any file.
*   On-demand thumbnail generation for images and videos for a better browsing experience.
*   Responsive design for use on various devices.

## Future Plans

I have a few features I'm planning to add in the future:

*   **Password Protection:** Secure access to the server.
*   **File Uploads:** Allow uploading files from a client device (e.g., my phone) to any specified folder on the host machine (e.g., my MacBook).

For now, I'm satisfied with its current functionality for my needs.

## How to Run

1.  **Prerequisites:**
    *   Node.js and npm installed.
    *   FFmpeg installed and accessible in your system's PATH (for video thumbnail generation). You can install `ffmpeg-static` via npm as a dev dependency if you prefer to bundle it with the project, or ensure the `ffmpeg` command is globally available.

2.  **Clone the repository (if you haven't already):**
    ```bash
    git clone https://github.com/MrSamSeen/FinderFI.git
    cd FinderFI
    ```

3.  **Install dependencies:**
    This project uses Node.js and npm for package management. The `package.json` file lists all necessary dependencies (similar to a `requirements.txt` file in Python projects or a `pom.xml` in Maven projects).
    To install them, run:
    ```bash
    npm install
    ```

4.  **Start the server:**
    You can start the server using the appropriate script for your operating system:

    *   **For macOS/Linux (using Bash):**
        Make the script executable (only needs to be done once):
        ```bash
        chmod +x run.sh
        ```
        Then run:
        ```bash
        ./run.sh
        ```

    *   **For Windows (using Command Prompt or PowerShell):**
        ```bash
        run.bat
        ```

    Alternatively, you can still run it directly with Node.js:
    ```bash
    node server.js
    ```
    The server will typically start on port 3000. You'll see a vibrant welcome message in your console, including a QR code for easy access from mobile devices, and the server address like:
    `Server running at: http://<your-local-ip>:3000/`

5.  **Access from another device:**
    Open a web browser on any device connected to the same Wi-Fi network and navigate to the URL shown in the console (e.g., `http://192.168.1.100:3000/`).

## Contributing

This was built for a personal use case, but if you have ideas for improvements or new features, feel free to fork the repository, make your changes, and submit a pull request. I'm more than happy to review and merge contributions that align with the project's goals!

## Disclaimer

This server provides access to your computer's file system. By default, it serves files from your home directory (`os.homedir()`). Be mindful of the security implications of running this on your network, especially if it's not a trusted private network. Future versions aim to add password protection to mitigate some of these risks.