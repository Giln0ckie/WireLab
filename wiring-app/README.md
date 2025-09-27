<p align="center">
  <img src="https://giln0ckie.github.io/WireLab/static/media/Banner.13621b95f53050a71ee4.png" alt="WireLab Banner" />
</p>

# WireLab

**WireLab** is an interactive simulator for exploring **UK domestic wiring practices**.  

I originally built it just to test my own understanding while replacing some sockets at home. Two days later, it grew into a complete browser-based wiring lab.  

👉 **Try it live here:** [https://giln0ckie.github.io/WireLab/](https://giln0ckie.github.io/WireLab/)  
*(Best viewed on desktop — mobile support coming soon.)*  

📖 Table of Contents

- [Features](#-features)  
- [How to Use](#️-how-to-use)  
- [Disclaimer](#-disclaimer)  
- [Tech Stack](#-tech-stack)  
- [Author](#-author)  

## ✨ Features

### Realistic wiring system  
- Harmonised **Line, Neutral, and Earth** colours  
- Conductor palette with **recolouring, thickness adjustments, and visibility toggles**  
- Wire layering (send to back/bring forward) for clarity  

### Component library  
- Drag-and-drop supply, lamps, sockets (1G, 2G, switched, RCD), ceiling roses, switches (1-way, 2-way, intermediate)  
- Consumer units (all-MCB and split load), FCUs, cooker control units  
- Connector blocks and Wago-style lever connectors  

### Interactive tools  
- **Voltage pen** → scan terminals to check for “live” conductors (like a non-contact tester)  
- **Meter tool** → measure resistance or voltage between two terminals  
- **Scissors** → cut wires to simulate breaks  
- **Snap-to-grid**, drag-to-move components, and selection highlights  
- Keyboard and pointer accessibility for switches and terminals  

### Simulation & testing  
- Built-in rules for wire sizing, resistance, and ampacity  
- Live **resistance and voltage measurement** via the meter  
- Fault simulation: open circuits, high-resistance joints, broken neutrals, incorrect spurs  
- Preset circuits like *Good ring*, *Broken neutral at lamp*, and *Spur off spur*  

## 🕹️ How to Use

1. **Add components**  
   - Select from the palette on the left  
   - Place them on the grid and drag to move  

2. **Wire them together**  
   - Click one terminal, then another to connect  
   - Use the wire palette for colour/thickness/visibility  

3. **Test your circuits**  
   - Use the **voltage pen** to scan for “live” conductors  
   - Use the **meter** to measure between two points (voltage/resistance)  
   - Use the **scissors** to cut a wire and simulate a break  
   - Load **presets** for ready-made working and faulty examples  

4. **Experiment & learn**  
   - Build a compliant ring final  
   - Try a spur off a spur and see why it fails  
   - Break a neutral and use the meter to diagnose  

## ⚠️ Disclaimer

WireLab is a **learning and practice tool** that simulates wiring logic in a browser.  

It does **not** guarantee compliance with wiring regulations (such as **BS 7671**) and must **not** be used as professional design or installation guidance. 

It’s built purely for **experimentation, and fun**.  

## 🛠 Tech Stack

- **React + Vite** – core app framework and build tooling  
- **SVG rendering** – components, wires, and interactive grid  
- **Custom wiring engine** – models terminals, connections, resistance, and faults  
- **Dijkstra algorithm** – used for lowest-resistance pathfinding when measuring resistance/voltage  
- **Presets system** – JSON-based saved circuits for quick demos and practice  

## 👤 Author

<p align="center">
  <img src="https://avatars.githubusercontent.com/u/234588565?v=4" alt="Profile picture" width="120" height="120" style="border-radius:50%" />
</p>

Made by **Giln0ckie**, supported by **AI Agents**.  

# WireLab

[![Deploy](https://github.com/Giln0ckie/WireLab/actions/workflows/deploy.yml/badge.svg)](https://github.com/Giln0ckie/WireLab/actions/workflows/deploy.yml)

