- [AudioCaptureOptions](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html)

# Interface AudioCaptureOptions

interfaceAudioCaptureOptions{

[autoGainControl](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#autogaincontrol)?:ConstrainBoolean;

[channelCount](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#channelcount)?:ConstrainULong;

[deviceId](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#deviceid)?:ConstrainDOMString;

[echoCancellation](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#echocancellation)?:ConstrainBoolean;

[latency](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#latency)?:ConstrainDouble;

[noiseSuppression](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#noisesuppression)?:ConstrainBoolean;

[processor](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#processor)?: [TrackProcessor](https://docs.livekit.io/reference/client-sdk-js/interfaces/TrackProcessor.html) < [Audio](https://docs.livekit.io/reference/client-sdk-js/enums/Track.Kind.html#audio), [AudioProcessorOptions](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioProcessorOptions.html) >;

[sampleRate](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#samplerate)?:ConstrainULong;

[sampleSize](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#samplesize)?:ConstrainULong;

[voiceIsolation](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#voiceisolation)?:ConstrainBoolean;

}

##### Index

### Properties

[autoGainControl?](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#autogaincontrol) [channelCount?](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#channelcount) [deviceId?](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#deviceid) [echoCancellation?](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#echocancellation) [latency?](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#latency) [noiseSuppression?](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#noisesuppression) [processor?](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#processor) [sampleRate?](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#samplerate) [sampleSize?](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#samplesize) [voiceIsolation?](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#voiceisolation)

## Properties

### `Optional`autoGainControl [Permalink](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html\#autogaincontrol)

autoGainControl?:ConstrainBoolean

specifies whether automatic gain control is preferred and/or required

### `Optional`channelCount [Permalink](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html\#channelcount)

channelCount?:ConstrainULong

the channel count or range of channel counts which are acceptable and/or required

### `Optional`deviceId [Permalink](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html\#deviceid)

deviceId?:ConstrainDOMString

A ConstrainDOMString object specifying a device ID or an array of device
IDs which are acceptable and/or required.

### `Optional`echoCancellation [Permalink](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html\#echocancellation)

echoCancellation?:ConstrainBoolean

whether or not echo cancellation is preferred and/or required

### `Optional`latency [Permalink](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html\#latency)

latency?:ConstrainDouble

the latency or range of latencies which are acceptable and/or required.

### `Optional`noiseSuppression [Permalink](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html\#noisesuppression)

noiseSuppression?:ConstrainBoolean

whether noise suppression is preferred and/or required.

### `Optional`processor [Permalink](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html\#processor)

processor?: [TrackProcessor](https://docs.livekit.io/reference/client-sdk-js/interfaces/TrackProcessor.html) < [Audio](https://docs.livekit.io/reference/client-sdk-js/enums/Track.Kind.html#audio), [AudioProcessorOptions](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioProcessorOptions.html) >

initialize the track with a given processor

### `Optional`sampleRate [Permalink](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html\#samplerate)

sampleRate?:ConstrainULong

the sample rate or range of sample rates which are acceptable and/or required.

### `Optional`sampleSize [Permalink](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html\#samplesize)

sampleSize?:ConstrainULong

sample size or range of sample sizes which are acceptable and/or required.

### `Optional``Experimental`voiceIsolation [Permalink](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html\#voiceisolation)

voiceIsolation?:ConstrainBoolean

a stronger version of 'noiseSuppression', browser support is not widespread yet.
If this is set (and supported) the value for 'noiseSuppression' will be ignored

#### See [Permalink](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html\#see)

[https://w3c.github.io/mediacapture-extensions/#voiceisolation-constraint](https://w3c.github.io/mediacapture-extensions/#voiceisolation-constraint)

### Settings

Member Visibility

- Inherited

ThemeOSLightDark

### On This Page

Properties

[autoGainControl](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#autogaincontrol) [channelCount](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#channelcount) [deviceId](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#deviceid) [echoCancellation](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#echocancellation) [latency](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#latency) [noiseSuppression](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#noisesuppression) [processor](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#processor) [sampleRate](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#samplerate) [sampleSize](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#samplesize) [voiceIsolation](https://docs.livekit.io/reference/client-sdk-js/interfaces/AudioCaptureOptions.html#voiceisolation)

MMNEPVFCICPMFPCPTTAAATR