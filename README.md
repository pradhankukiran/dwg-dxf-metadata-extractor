# DWG/DXF Metadata Extractor

Extract metadata from DWG and DXF files using Autodesk Platform Services (APS).

[![Deployed on Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)](https://vercel.com/pradhankukiran-projects/v0-dwg-dxf-metadata-extractor)

## Overview

This Next.js application allows you to upload DWG or DXF files and extract their metadata using the Autodesk Platform Services Model Derivative API.

## Features

- Upload DWG/DXF files via drag-and-drop or file picker
- Automatic file conversion and metadata extraction using APS
- Display of file status, derivatives, and model views
- Modern UI with dark mode support

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env.local` file with your Autodesk Platform Services credentials:
   ```
   APS_CLIENT_ID=your_client_id
   APS_CLIENT_SECRET=your_client_secret
   ```
4. Run the development server:
   ```bash
   npm run dev
   ```
5. Open [http://localhost:3000](http://localhost:3000)

## Technologies

- Next.js 16
- React 19
- TypeScript
- Autodesk Platform Services SDK
- Tailwind CSS
- shadcn/ui components