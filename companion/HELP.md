# RME TotalMix FX

This module controls TotalMix FX through OSC and listens to TotalMix's return stream for authoritative state.

## Connection setup

Configure a TotalMix OSC remote and this Companion connection with matching ports. The default same-computer setup is:

| Setting                 | Value                       |
| ----------------------- | --------------------------- |
| Host                    | `127.0.0.1`                 |
| TotalMix receive port   | `7001`                      |
| Companion feedback port | `9001`                      |
| TotalMix version        | `2.1 or newer (Global OSC)` |

<br>

### Recommended Global OSC settings

In TotalMix FX 2.1, select **Global OSC** under **Compatibility (Mode)** and open **Details**. Use these settings:

| TotalMix setting                | Recommendation | Purpose                                                                                                                        |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Send changes**                | Required       | Sends GUI and mixer changes to Companion.                                                                                      |
| **Send all data on start**      | Off            | Companion requests its own initial state with `/sendall`; enabling both only duplicates traffic.                               |
| **Send status**                 | Recommended    | Supplies device, connection, DSP, and heartbeat information.                                                                   |
| **Receive to hidden channels**  | Optional       | Enable only if Companion should control channels hidden from Global OSC. Hidden channels are otherwise omitted from selectors. |
| **Set all faders in group**     | Optional       | Makes a received fader command operate on the complete TotalMix fader group.                                                   |
| **Send faders in linear scale** | Optional       | The module accepts both linear `0–1` fader feedback and dB feedback.                                                           |
| **Re-send received**            | Recommended    | Immediately confirms commands that TotalMix received from Companion.                                                           |
| **Re-send if different**        | Optional       | Reduces unnecessary return traffic by limiting re-sends to changed values.                                                     |
| **Bandwidth limitation**        | `500 kByte/s`  | A practical starting point, especially for the initial state of large interfaces.                                              |

> Note: TotalMix labels **Re-send received** with “use carefully” because an OSC client that blindly echoes incoming messages could create a loop. This module never forwards received OSC messages: feedback only updates its local state, while actions send commands. The option is therefore safe and recommended here for immediate command confirmation. Without it, actions still work and are confirmed by a later state refresh.

In the main OSC settings, enable **Send Level Data** only when meter feedbacks are required. Meter traffic can be substantial. **Lock Remote to Submix** and the legacy bank-size setting are not used by Global OSC.

For TotalMix FX 1.96 through 2.03, choose **1.96 or newer** in Companion and the matching compatibility mode in TotalMix. OSC 1.96 also requires the same bank size in both applications.

Enable the TotalMix OSC remote. The Companion connection becomes green after the first heartbeat or state message is received.

> The feedback port must be unique. If a Generic OSC connection already listens on `9001`, disable its listener or use another TotalMix remote/port pair.

## Actions

- **Adjust fader level** applies a signed normalized or dB step. Select the TotalMix row first: Hardware input and Software playback show Source and Destination, while Hardware output shows only Output. The action requests the current value first when necessary.
- **Set fader level** uses the same row-first selection and sets an absolute fader value.
- **Mute channel** and **PFL channel** offer explicit On, Off, and state-aware Toggle operations.
- **Adjust pan/balance** and **Set pan/balance** use the same row-first target workflow. Positions range from `-100` left through `0` center to `+100` right.
- **Recall snapshot** loads snapshots 1–8. Global OSC also provides **Save snapshot** and **Load layout preset**. **Load Quick Workspace** loads legacy Quick Workspaces 1–30.
- **Adjust/Set input gain**, **Phantom power**, **Instrument input**, **Input pad**, and **AutoSet gain** are shown for the paths reported by Global OSC or for channels supported by the selected OSC 1.96 profile.
- **Set/toggle channel option** uses the same row-first selector for phase left/right, MS processing, stereo mode, Cue, Talkback inclusion, Trim exclusion, right-channel gain, analog reference level, and stereo width. Fields change with the selected option. Options marked as input- or output-only are validated before a command is sent.
- **Set channel name** is available in Global OSC mode and immediately refreshes Companion's selectors.
- **Output loopback** and **Control Room** expose the corresponding TotalMix monitoring functions.
- **Set/toggle group** controls Mute, PFL, and Fader groups 1–4 with explicit On, Off, and state-aware Toggle operations.
- **Undo/redo** triggers TotalMix's global Undo or Redo command.
- **DURec transport** and **DURec channel recording** appear when TotalMix reports DURec support. Transport commands include Record Toggle, Record Start, Record Stop, and Play/Pause; Global OSC adds previous/next file commands. Global OSC uses TotalMix's direct confirmed Stop value, while OSC 1.96 automatically sends the required second Stop trigger.
- **Channel processing**, **Global FX**, and **Room EQ** expose the parameters documented in RME's current OSC table. Global OSC uses native TotalMix values; OSC 1.96 uses normalized `0–1` values.
- **Show/hide TotalMix window** is available in Global OSC mode.
- **Request submix target state** forces a fresh state response for a selected target.

For encoder rotation, create two **Adjust fader level** actions. A useful starting point is `+1 dB` clockwise and `-1 dB` counterclockwise.

The regular actions retain this row-first configuration. The supplied encoder presets additionally use an internal target expression so their actions and feedbacks can share one button-local selection.

## Feedbacks

- TotalMix OSC connection active
- Global OSC device connection, detected device name, and DSP load
- Channel is muted
- Channel PFL is active
- Submix fader is above/below a threshold
- Submix target has confirmed OSC state
- Submix fader value
- Output fader value
- Active snapshot
- Input gain and hardware-option states
- Channel-option states and formatted values
- Channel level above a configurable dBFS threshold, with left, right, or either-side detection
- Mute, PFL, and Fader group states
- Pan/balance and loopback
- Control Room state
- Dynamic TotalMix channel name and peak level
- DURec state, time, recording state, and playback state
- Channel processing, global FX, and Room EQ state/value

Feedbacks read the local state cache. When a target feedback is used, the module registers that target with a rate-limited background synchronizer so the callback itself never blocks on an OSC request.

Enable **Send Channel Names** and **Send Peak Level** in the TotalMix OSC remote when using the corresponding feedbacks. Meter traffic can be substantial; only enable peak transmission when needed.

## Variables

Fader values for specific routes and outputs are provided by API 2.1 Value feedbacks. Companion can bind these feedbacks to button-local variables, so each button carries its own target configuration and there is no fixed watch limit.

When a placed feedback uses a channel, route, output, processing parameter, or Room EQ parameter, the module also publishes that value automatically as a normal connection variable. Core Fader, Pan, Mute, PFL, Gain, hardware-option, processing, and Room EQ actions publish their target when first executed. Identical targets are deduplicated, and only values actually used by buttons are exposed; the module does not create variables for the complete mixer matrix.

Variable IDs use stable one-based row positions, for example `input_1_name`, `output_1_fader_db`, and `route_input_1_to_output_3_fader_db`. The description follows the current TotalMix channel names, but renaming a channel does not change the variable ID. Published targets remain synchronized and can be used by other buttons, triggers, and expressions.

Confirmed values come from TotalMix. A value can temporarily be optimistic immediately after an action, or stale if the return stream stops.

The connection exposes its OSC connection state, the continuously synchronized active snapshot, and, when available, continuously synchronized DURec state and time. Global OSC additionally provides the detected device, TotalMix device connection, and DSP status.

## Presets

Presets are grouped directly by workflow: **Stream Deck + encoders**, **Channel controls**, **Control Room**, **Snapshots and history**, and **DURec**. Device-dependent presets are shown only when the current profile or Global OSC discovery reports the required feature.

The Stream Deck + templates include one editable Fader, a dedicated Main output fader, input gain, and pan/balance. Each exposes one feedback-driven local variable named `target`. Change only that variable to retarget the complete preset: encoder and press actions, channel name, value display, gauge, and active-state feedback all follow it automatically. Fader and Pan/Balance provide Row, Source, and Destination/Output fields; Main provides only Output; Gain provides only Hardware input.

Faders use ±1 dB steps and show their live dB value without a gauge. Input gain uses ±0.5 dB in Global OSC mode; its ring fills against the selected input's device-specific range and follows a separate Instrument range where the hardware provides one. Pan/balance uses ±5 steps; its ring fills from top center towards the current position and shows `L` or `R` at the endpoints. Pressing either Fader encoder toggles Mute, pressing a supported Gain encoder toggles AutoSet, and pressing Pan/Balance returns it to center. The Main preset follows the output named `Main` by TotalMix and falls back to the first hardware output until that name is available. A muted Fader displays `MUTED` in TotalMix cyan, and active AutoSet uses TotalMix orange. Dim remains available as a regular Control Room button.

The button presets cover Mute, PFL, an input Peak/Clip indicator, supported input hardware options, Loopback, Dim, Mono, Talkback, Speaker B, Snapshot 1–8 recall, Undo, Redo, and available DURec controls. The Peak/Clip preset turns red when either meter side reaches its editable `-1 dBFS` default threshold; TotalMix level transmission must be enabled. Layered labels are scaled to visually match regular Companion buttons. DURec uses short transport labels without a separate display-only status preset. REC adds TotalMix's live time and turns red while recording. PLAY changes to PAUSE, adds the live time, and highlights the button while playing.

Preset colors follow TotalMix's visual language: cyan for active Mute, orange for PFL and enabled channel options, blue-gray for active Control Room functions, and red for recording or potentially hazardous routing states such as Loopback. Presets are editable templates.

## TotalMix OSC limitations

- Global OSC can recall and save snapshots; OSC 1.96 can only recall them.
- OSC can load Quick Workspaces but does not return workspace names or a dependable active-workspace state.
- Global OSC can read and rename channels; OSC 1.96 only receives names.
- Feature availability is device- and channel-dependent. Global OSC definitions follow the paths reported by TotalMix; OSC 1.96 definitions follow the selected device profile.
- DURec actions can start recording or playback. Verify the attached storage and armed channels before using them in production.
