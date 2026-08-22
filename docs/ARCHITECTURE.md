# Architecture

## Goals

The module provides a dependable control surface for TotalMix FX through two protocol families. Global OSC uses absolute addresses and authoritative push feedback. Legacy OSC remains context-sensitive, so an action must operate on the requested row, channel, and output even when the TotalMix UI or another OSC controller changed the remote selection immediately beforehand.

## Component overview

```text
Companion action / feedback / variable
                  │
                  ▼
       TotalMixController + queue
        │ selects context       │ updates
        ▼                       ▼
   OSC UDP transport      TotalMixStateStore
        │                       ▲
        └──── TotalMix FX ──────┘
             commands + replies
```

### Companion integration

`src/main.ts` owns the connection lifecycle and publishes actions, feedbacks, presets, and variables. It reports a connection as active only after receiving an OSC packet from TotalMix. Legacy OSC supplies a periodic `/` heartbeat. Global OSC is monitored with `/status/*` messages and rate-limited `/sendstate` probes, with a longer timeout to accommodate TotalMix's status batching.

### Device discovery and profiles

`src/model/profiles/` separates physical channel order and hardware capabilities from OSC behavior. Included profiles define:

| Interface                       | Hardware inputs | Software playbacks | Hardware outputs |
| ------------------------------- | --------------- | ------------------ | ---------------- |
| Fireface UFX II                 | 30              | 30                 | 30               |
| Fireface UFX III                | 94              | 94                 | 94               |
| Fireface UFX                    | 30              | 30                 | 30               |
| Fireface UCX II                 | 20              | 20                 | 20               |
| Fireface UCX                    | 18              | 18                 | 18               |
| Babyface                        | 10              | 12                 | 12               |
| Fireface 802 FS                 | 30              | 30                 | 30               |
| Babyface Pro FS                 | 12              | 12                 | 12               |
| Fireface UC                     | 18              | 18                 | 18               |
| Digiface AES                    | 14              | 16                 | 16               |
| Digiface Dante                  | 128             | 128                | 130              |
| Digiface Ravenna (RAVENNA mode) | 128             | 128                | 130              |
| Digiface Ravenna (MADI mode)    | 128             | 128                | 130              |

Actions use stable zero-based indexes internally and display interface-specific channel labels to the user. In OSC 1.96, profile capability lists identify the channels that implement gain, phantom power, Instrument, Pad, and AutoSet, plus device-wide DURec and DSP availability. Profiles may have asymmetric rows, such as the Digiface AES with 14 hardware inputs and 16 playback/output channels; each row therefore retains its own OSC index sequence.

Global OSC does not require a matching profile. `/input|playback|output/{channel}/*` messages build an unbounded live channel map, while returned hardware-option, DURec, processing, global FX, and Room EQ paths build the capability set. Names and colors determine the displayed label and visibility; hidden channels (`color = 0`) are omitted. A newly observed channel or capability increments a discovery revision and debounces regeneration of Companion's action and feedback definitions. An internal fallback supplies startup choices only until the first channel data arrives; the profile selector is hidden in Global OSC mode.

`/status/device` still selects a matching included profile when one exists, improving the startup fallback before discovery completes. Unknown product names do not restrict Global OSC operation.

In OSC 1.96 mode, the controller walks the configured banks for input, playback, and output and collects Page 1 `trackname` replies. Unused `n.a.` fader slots are discarded. Both paths rebuild the action and feedback choices so stereo pairing, Control Room assignments, and custom TotalMix labels are represented exactly.

### OSC transport and codec

`src/osc/transport.ts` uses one UDP socket for sending commands and receiving feedback. The listener binds exclusively so a conflicting port produces an actionable connection error.

`src/osc/codec.ts` implements the OSC types used by TotalMix: 32-bit integers, 32-bit floats, strings, booleans, messages, and bundles. Keeping this layer local avoids adding a runtime dependency for a small protocol subset.

### Protocol controller

Global OSC addresses every object directly. Examples include `/mix/in/3/8/faderlin`, `/output/4/faderlin`, and `/input/2/48v`. `TotalMixController` therefore sends no bus, bank, output, or GUI selection before these commands. At startup it requests status, settings, and active mixer nodes; registered feedback targets use `/sendchan` or `/sendsubmix` for targeted refreshes. Incoming absolute paths can be assigned to state without relying on mutable selection context.

The same controller retains the following selector transaction model for OSC 1.96.

Interactive Legacy Gain, Fader, and Pan writes use a low-latency path. Their required selectors and value are sent as one uninterrupted sequence without settle delays. The requested value is stored optimistically, stale values from selector-triggered dumps are ignored, and the authoritative TotalMix response reconciles state asynchronously. Background polling yields while such a write is pending. State synchronization and non-interactive Page 2 operations retain the serialized, reply-aware workflow because their correctness depends on the selected channel's complete settings block.

TotalMix channel paths are relative to remote-controller state:

1. selected bus: input, playback, or output;
2. selected output submix;
3. bank start and bank size;
4. selected channel offset for Pages 2 and 4;
5. selected output and left/right side for Room EQ.

For example, `/1/volume2` does not identify an absolute source by itself. `TotalMixController` serializes operations through a transaction queue and maintains the selection context used to interpret replies. A source index is resolved as:

```text
bankStart = floor(sourceIndex / bankSize) * bankSize
slot      = sourceIndex - bankStart + 1
```

TotalMix indexes `/setSubmix` and `/setBankStart` from zero, while page-1 path suffixes start at one.

Changing a selector causes TotalMix to send a state dump. Reply-dependent synchronization and non-interactive operations insert a short settling interval between context changes so packets from different dumps are not assigned to the next selection. Interactive Gain, Fader, and Pan writes instead protect their optimistic target from stale dump values while sending immediately. All action transactions share the same queue, preventing two Companion actions from interleaving their selectors and values.

Every action repeats its complete selector sequence, even if the module last used the same context. This is intentional: TotalMix's GUI and other remote controllers can change the shared OSC selection without notifying this module through a dedicated context message.

### State store

Values have one of four quality states:

- `unknown`: no value has been observed;
- `optimistic`: a command was sent but has not yet been confirmed;
- `confirmed`: the value came from TotalMix;
- `stale`: feedback timed out.

Submix faders and pans are keyed by bus, source, and output. Mute and PFL (`solo` in the OSC protocol), names, meters, and Page 2 processing values are keyed by bus and channel. Hardware-output faders and balance values are keyed by output. Snapshot and global Page 1/3 values have dedicated stores. Room EQ parameters are keyed by output, side, and parameter. Display strings such as `-5.2 dB` are stored alongside normalized values when TotalMix supplies them. The store additionally records every absolute Global OSC channel and capability path so unknown interface models can populate the same selectors and definitions as included devices.

### Relative actions and toggles

An increment/decrement action uses a confirmed or recent optimistic value. If none is available, the controller reselects the target bus to request a state dump and waits for the matching reply. It fails explicitly on timeout; it never invents a fader position.

Mute, PFL, hardware, channel-option, Control Room, group, processing, global FX, and Room EQ toggles follow the same state-aware rule. Global OSC sends the derived boolean to an absolute path and receives the resulting state. Legacy toggle-style parameters are triggered with `1`, while Page 3 group addresses additionally use reversed numbering.

### Feedback target synchronization

Feedback callbacks are synchronous cache reads and never perform network I/O. When Companion evaluates a target feedback, the callback registers its route or channel in a local target registry. A separate scheduler refreshes one due target at a time through the same transaction queue used by actions.

Targets are deduplicated and refreshed at a controlled interval. Transient feedback targets are removed after they have not been observed for a while. A target that has been published as a normal connection variable remains active for the lifetime of the module instance so the variable continues to receive authoritative state. This avoids blocking Companion's feedback evaluation and prevents concurrent selector sequences from corrupting the OSC context.

## Fader conversion

Both OSC tables document TotalMix's nonlinear 1023-step fader curve. `src/protocol/fader-curve.ts` implements both directions and clamps the user-facing range to approximately `-65 dB` through `+6 dB`. Global OSC uses `faderlin` for normalized transport while also accepting returned `fader`/`volume` dB paths. This preserves identical fader actions and feedbacks across both protocols.

## Value feedbacks and local variables

Actions and feedbacks can address channels directly. API 2.1 Value feedbacks expose normalized or TotalMix-formatted values for:

- a source in an output submix;
- a hardware output fader;
- pan/balance and gain;
- channel names and meters;
- processing, global FX, and Room EQ parameters;
- DURec state and time.

A preset can bind either feedback to a button-local variable and reference it as `$(local:variable_name)`. The feedback options travel with the button, eliminating connection-level watch configuration and fixed slot limits. Evaluating the Value feedback registers its target with the normal background synchronizer.

The Fader, Main Fader, Gain, and Pan/Balance encoder presets define a feedback-driven local variable named `target`. It contains a compact JSON selection: a row plus source and destination for a submix target, or a hardware-output index. Dedicated input-only and output-only target feedbacks keep the Gain and Main selectors appropriately constrained. Hidden preset-expression options pass `$(local:target)` to every dependent action and feedback at evaluation time. Standalone actions do not set this option and therefore retain their normal row-first option handling.

## Automatically published target variables

The module mirrors values used by placed target feedbacks into normal Companion connection variables. Core target actions perform the same registration when first executed. Published targets are deduplicated, kept synchronized, and assigned stable IDs derived from their one-based row positions rather than mutable channel names. Examples include:

```text
input_1_name
input_1_mute
output_1_fader_db
route_input_1_to_output_3_fader_db
```

The variable description uses the current TotalMix channel names for readability. Only values actually requested by buttons are published. This keeps the variable set proportional to the configured control surface instead of exposing every channel property or every source-to-output node in the routing matrix.

## Failure behavior

- UDP bind errors, including a feedback-port collision, set the Companion connection to an error state.
- No TotalMix packets for three seconds marks the connection failed and cached values stale.
- Missing feedback during a state-dependent action causes the action to log a timeout and leave the target unchanged.
- Reconfiguring the connection closes the previous socket and invalidates the previous selection context.

## Protocol boundaries

The implementation follows RME's Global OSC beta 2 table for TotalMix FX 2.1 and the OSC 1.96 table for older releases. Global OSC adds snapshot saving, layout loading, channel renaming, window control, absolute levels, device status, and broader DURec transport. Quick Workspaces remain a legacy receive-only command without names or dependable active state. Device and channel capabilities determine whether hardware options, DURec, DSP processing, and Room EQ have an effect.
