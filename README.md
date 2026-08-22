# RME TotalMix FX module for Bitfocus Companion

This module controls RME TotalMix FX through its bidirectional OSC interfaces. TotalMix FX 2.1 Global OSC is the recommended mode; selector-based OSC 1.96 remains available for older installations.

## Features

- Dynamic channel and capability discovery for RME interfaces supported by TotalMix FX 2.1 Global OSC.
- Legacy/startup profiles for Fireface UFX/UFX II/UFX III, Fireface UC/UCX/UCX II, Fireface 802 FS, Babyface/Babyface Pro FS, Digiface AES/Dante/Ravenna, and HDSPe AIO Pro/RayDAT/MADI FX/AES.
- UDP sender and dedicated OSC feedback listener.
- Direct, absolute channel and submix addressing with TotalMix FX 2.1 Global OSC.
- Backward-compatible serialized bus, submix, bank, and channel selection for OSC 1.96.
- Unified set and increment/decrement fader actions with a row-first Hardware input, Software playback, or Hardware output workflow.
- On, off, and state-aware toggle actions for mute and PFL.
- Pan/balance, output loopback, and Control Room actions.
- Snapshot recall and active-state feedback, Global OSC snapshot saving and layout loading, and Quick Workspace 1–30 loading.
- Device-aware gain, phantom power, Instrument, Pad, and AutoSet controls.
- Unified channel options for phase, MS processing, stereo mode, Cue, Talkback/Trim participation, right-channel gain, reference level, and width.
- Dynamic TotalMix channel names in action/feedback selectors, Global OSC channel renaming, channel-name and peak-level Value feedbacks, and configurable peak/clip threshold feedback.
- Device-aware DURec transport, channel record-enable, state, time, recording, and playback feedbacks.
- State-aware Mute, PFL, and Fader groups 1–4 plus TotalMix Undo/Redo.
- Channel EQ, dynamics, Auto Level, low cut, global reverb/echo, and Room EQ controls and feedbacks on capable devices.
- Connection, detected-device, DSP-load, mixer, processing, hardware, Control Room, snapshot, DURec, and value feedbacks.
- Cached feedback evaluation with serialized background synchronization of active targets.
- Automatic connection variables for channel and routing values actually used by feedbacks or executed actions, without fixed watch slots.
- Compact workflow-based presets for Stream Deck + Fader and Main value encoders plus live TotalMix-orange Gain and Pan/Balance ring gauges; each encoder has one feedback-driven local target shared by its actions and feedbacks.
- Automatic Global OSC device and channel discovery. Known device profiles constrain hardware-specific capabilities, while unknown devices use the feature paths reported by TotalMix.
- TotalMix's official nonlinear fader conversion between normalized OSC values and dB.

## Requirements

- Bitfocus Companion 5 or newer.
- RME TotalMix FX with OSC enabled.
- An RME interface supported by TotalMix FX 2.1 Global OSC, or one of the included profiles when using legacy OSC.
- Node.js 22.20 or newer and Yarn 4 for development.

## TotalMix setup

In **TotalMix FX → Options → Settings → OSC** configure one remote controller:

- Remote Controller: enabled
- Host: the IP address of the Companion computer (`127.0.0.1` when both run on the same Mac)
- Outgoing port / TotalMix receive port: `7001`
- Incoming port / Companion feedback port: `9001`
- Compatibility (Mode): `Global OSC` for TotalMix FX 2.1 or newer

Open **Details** for that controller and enable **Send changes**, **Send status**, and **Re-send received**. The last option lets TotalMix immediately confirm commands received from Companion; this module never echoes feedback, so it does not create an OSC loop. **Send all data on start** is unnecessary because the module requests its own initial state. Enable level transmission only when meter feedbacks are needed, and use TotalMix's bandwidth limiter for large interfaces; 500 kByte/s is a practical starting point.

Select **2.1 or newer (Global OSC)** as the TotalMix version in the Companion connection. In this mode the interface and bank-size settings are hidden. The module discovers channel indices, names, visibility, and available feature paths directly from TotalMix, so the interface does not need to be statically included in the module. Internal fallback labels are replaced when the initial state transfer finishes.

For TotalMix FX 1.96 through 2.03, select **1.96 or newer** in Companion and the matching compatibility mode in TotalMix. Set a suitable bank size and enable channel-name and peak-level transmission when required.

Use the same values in the Companion connection configuration.

Only one process can normally bind the feedback port. Disable any Generic OSC Companion connection listening on port `9001`, or allocate a different TotalMix remote/port pair to this module.

## Why the return channel matters

TotalMix does return state. Global OSC reports absolute paths such as `/mix/in/0/2/faderlin`, `/input/0/mute`, and `/status/device`; no currently selected GUI bus is involved. The module requests an initial state and then consumes TotalMix's live return stream.

In the legacy protocol, sending `/1/volume2 0.66` produces feedback such as `/1/volume2Val "-5.2 dB"`, and selecting a bus, bank, or submix causes TotalMix to resend the relevant state block.

The module uses that behavior before relative and toggle operations. If a value is not known, it requests a fresh state dump instead of assuming a local default. Locally written values remain marked as optimistic until TotalMix confirms them.

Feedback callbacks only read the local state cache. Targets used by feedbacks are refreshed by a separate rate-limited scheduler, keeping Companion's feedback evaluation responsive. API 2.1 Value feedbacks can drive button-local variables without fixed connection-level watch slots. The same used targets are automatically mirrored into normal connection variables with stable index-based IDs, so their values can also be referenced by other buttons, triggers, and expressions.

## OSC limitations

The current RME OSC table supports all implemented control groups, but not every related TotalMix operation:

- Global OSC can recall and save snapshots 1–8 and reports their active/changed state. Legacy OSC can only recall them.
- Global OSC can load layout presets and show or hide the TotalMix window. Quick Workspaces remain a separate legacy command.
- Quick Workspaces 1–30 can be loaded. OSC does not provide their names, save operation, or a reliable active-workspace state.
- Global OSC can read and rename channels. Legacy OSC only receives channel names.
- Hardware controls, DURec, DSP effects, and Room EQ depend on the interface and channel. In Global OSC mode, definitions are built from the paths TotalMix reports; OSC 1.96 uses the selected profile.
- The Digiface AES legacy profile exposes its microphone hardware controls, but omits the combined channel-processing actions because the device implements EQ and Low Cut without the Dynamics and Auto Level sections represented by those actions.
- HDSPe AIO Pro, RayDAT, and AES have no internal TotalMix FX DSP, so their legacy profiles omit channel processing, Reverb/Echo, and Room EQ. HDSPe MADI FX exposes those DSP controls but has no hardware preamp or DURec controls.
- HDSPe profiles describe their full 44.1/48 kHz layouts. ADAT and MADI channel availability is reduced at higher sample rates, while HDSPe AES retains all 16 channels.
- Digiface Dante and Digiface Ravenna expose no TotalMix DSP effects. Their full channel counts apply at 44.1/48 kHz and are reduced at double and quad sample rates.
- Global OSC processing parameters use TotalMix's native engineering values. Legacy OSC processing actions use the normalized `0–1` scale and receive formatted values separately.

## Development

```sh
corepack yarn install
corepack yarn build
corepack yarn test
corepack yarn lint
```

Create a Companion module package with:

```sh
corepack yarn package
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [Companion help](companion/HELP.md)
- [Release process](RELEASING.md)
- [Changelog](CHANGELOG.md)

## Protocol reference

The implementation is based on RME's Global OSC protocol beta 2 (2026-07-21) for TotalMix FX 2.1 and `OscTableTotalMix_240722.ods` for TotalMix FX 1.96. The supplied Companion page was used as an additional behavioral reference.

## License

MIT
