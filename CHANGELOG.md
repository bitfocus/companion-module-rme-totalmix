# Changelog

## 1.0.1

- Fix Stream Deck + encoder actions failing with "Encoder preset target is unavailable" in Companion 5.0.4.
- Restore encoder channel names, fader/gain/pan values, ring gauges, and state feedback by preserving shared target and value/state options during Companion's option evaluation.
- Remove the unsupported feedback option from the Input peak/clip indicator preset.
- Clarify Windows Global OSC setup, including the global OSC switch, explicit remote destination address, and incoming/outgoing port mapping.

## 1.0.0

- First stable public release.

## 0.1.0

- Initial release.
- Supports TotalMix FX 2.1 Global OSC with dynamic device and channel discovery, authoritative return-state feedback, and direct mixer addressing.
- Supports TotalMix FX 1.96 with device profiles and serialized selector-based OSC control.
- Provides fader, pan/balance, gain, channel, hardware-option, Control Room, snapshot, group, processing, FX, Room EQ, and DURec controls where supported by the connected interface.
- Includes live feedbacks, automatically registered Companion variables for used targets, device-aware presets, and Stream Deck + encoder workflows.
