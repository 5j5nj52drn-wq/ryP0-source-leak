# iOS Repo CMS & Expo Project Guidelines

These guidelines are curated specifically for building the cross-platform visual Content Management System (CMS) that manages the `repo.json` iOS repository. Adhere to these principles to maintain a native iOS feel, strict typing, and a serverless architecture.

## 🚨 MANDATORY DIRECTIVE: All iOS UI Must Be Built in Swift / SwiftUI
- **All iOS UI Elements**: Any and all user interface components targeting iOS (Navigation Bars, Tab Bars, Collapsible Headers, Context Menus, Forms, Sheets, Modals, Status Banners, and Controls) **MUST be built in Swift & SwiftUI** (or official Apple UIKit / `@expo/ui` SwiftUI primitives).
- **No NativeWind / CSS Simulators for iOS UI**: Do NOT simulate or emulate Apple native navigation bars, tab bars, context menus, or sheets using JS `View` / CSS / NativeWind styling on iOS.
- **Genuine Apple Frameworks**: Use real SwiftUI views (`.ultraThinMaterial`, `UIImpactFeedbackGenerator`, `Spring`, `GeometryReader`, `SF Symbols`) and native Swift modules for all iOS UI layers.

---

## Foundational Context & Tech Stack

This application is built using the Expo & Swift ecosystem to target iOS natively and Web simultaneously.

- **iOS Native UI**: Swift / SwiftUI (iOS 16+ / iOS 17+) via `@expo/ui` and Expo Native Modules
- **Framework**: Expo (React Native) & Swift
- **Language**: Swift (Native iOS UI) & TypeScript (Logic / State / Web)
- **Styling**: Native Swift / SwiftUI on iOS (TailwindCSS / NativeWind v4 strictly for Web fallback)
- **Animations**: SwiftUI Springs & Reanimated
- **Native Components**: Real SwiftUI Views, `@expo/ui`, Zeego (Native iOS context menus)
- **Interactions**: Native Swift gestures & `react-native-draggable-flatlist`
- **Database/Storage**: GitHub API (`repo.json` is the single source of truth; no SQL/NoSQL database)
- **Authentication**: GitHub OAuth / PAT
- **Backend/Scraping**: Vercel Serverless Functions OR Supabase Edge Functions

---

## Project Overview

- **Idea**: A custom visual CMS app to manage an iOS alternative app repository (`repo.json`).
- **Platform**: Native iOS (SwiftUI) and Web app.
- **Design Language**: Exact iOS/SwiftUI look and feel (SideStore, AltStore, Feather paradigms).
- **Primary Function**: To parse, visually display, edit, and push updates to a GitHub-hosted JSON file.

---

## MoSCoW Prioritization

### Must Have (Core MVP)
- **GitHub PAT / OAuth Authentication**: Secure login to interact with the repository.
- **Visual Dashboard**: Display all currently hosted apps as editable cards in SwiftUI.
- **Drag & Drop Reordering**: Visually reorganize the `repo.json` array.
- **Full App Editing**: Modal interfaces to edit HEX colors, icon URLs, bundle IDs, descriptions, and entitlements.
- **5 Input Methods for Adding Apps**:
  1. *Direct Link*: Auto-generate boilerplate from an `.ipa` URL.
  2. *Repo Link Extractor*: Parse third-party `repo.json` links via a bottom sheet and select apps to import.
  3. *GitHub Fetcher*: Call GitHub API `releases/latest` to grab `.ipa` assets, versions, and sizes.
  4. *Telegram Fetcher*: Ping serverless backend to run scraping script (using Telethon) and return app data.
  5. *Smart Scraper*: AI-assisted edge function to scrape custom Git instances (e.g., MeloNX on Gitea/GitLab) to find the latest tag and `.ipa` href.

### Should Have
- **Update All Automation**: A prominent UI button that triggers the `Update ALL Apps` GitHub Actions workflow (`update_all.yml`) via API.
- **Zeego / SwiftUI Context Menus**: Native long-press menus on app cards (Edit, Delete, Duplicate).
- **Floating Liquid Glass Tab Bar**: SwiftUI translucent capsule with adjacent Search FAB.

### Could Have
- **Visual Commit History**: A timeline tab showing recent automated updates pulled from GitHub Actions runs.
- **Live Preview**: A dynamic preview card showing how the app will look in package managers like SideStore, Scarlet, or Esign while editing.

### Won't Have (v1)
- Traditional relational database (PostgreSQL/MySQL) for app metadata.
- Complex user management (this is a single-admin tool).

---

## Architecture & Integration Rules

### 1. Data Layer (The "Database")
- **No Supabase DB**: Do not set up Postgres tables for the apps.
- **Single Source of Truth**: The app must fetch `repo.json` directly from the `ry0-x.github.io` repository on load.
- **Write Operations**: All saves, edits, and reorders must be compiled into a valid JSON object and pushed to the repository via the GitHub REST API (`PUT /repos/{owner}/{repo}/contents/{path}`).

### 2. Backend & Scraping (Serverless)
- Never attempt to run Python scripts or complex HTML scraping directly within the Expo frontend.
- Build lightweight Serverless Edge Functions to handle external requests (Telegram scraping, Custom Git scraping).
- The frontend will send the URL/channel name to the Edge Function, which will return standardized JSON containing `version`, `downloadURL`, `size`, and `date`.

### 3. Frontend & UI Conventions (Swift / SwiftUI First)
- **All iOS UI Elements in Swift**: Use genuine Swift / SwiftUI code for iOS navigation bars, tab bars, headers, buttons, cards, and modal sheets.
- **Routing**: Use Expo Router for file-based navigation.
- **State Management**: Use Zustand or React Query to manage the active state of the `repo.json` file.

---

## Developer Instructions

- Always type your `repo.json` interfaces in TypeScript and Swift structs thoroughly (e.g., `App`, `Version`, `AppPermissions`, `Entitlements`).
- When implementing a new scraping source, create a modular Edge Function rather than bloating existing functions.
- Prioritize error handling for GitHub API rate limits and invalid JSON formatting to prevent corrupting the live repository.

# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.
