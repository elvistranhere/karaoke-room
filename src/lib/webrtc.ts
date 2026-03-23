export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  {
    urls: "turn:a.relay.metered.ca:80",
    username: "e8dd65b92f6ebc3d1c34b109",
    credential: "kMYodm/PKoistas6",
  },
  {
    urls: "turn:a.relay.metered.ca:443",
    username: "e8dd65b92f6ebc3d1c34b109",
    credential: "kMYodm/PKoistas6",
  },
  {
    urls: "turn:a.relay.metered.ca:443?transport=tcp",
    username: "e8dd65b92f6ebc3d1c34b109",
    credential: "kMYodm/PKoistas6",
  },
];

export function createPeerConnection(): RTCPeerConnection {
  return new RTCPeerConnection({ iceServers: ICE_SERVERS });
}

/**
 * Modifies SDP to set Opus codec to 128kbps stereo for high-quality music.
 */
export function setOpusHighBitrate(sdp: string): string {
  const lines = sdp.split("\r\n");
  const result: string[] = [];

  // Find the Opus payload type
  let opusPayloadType: string | null = null;
  for (const line of lines) {
    const match = line.match(/^a=rtpmap:(\d+)\s+opus\/48000/i);
    if (match) {
      opusPayloadType = match[1]!;
      break;
    }
  }

  if (!opusPayloadType) return sdp;

  const fmtpPrefix = `a=fmtp:${opusPayloadType}`;
  let foundFmtp = false;

  for (const line of lines) {
    if (line.startsWith(fmtpPrefix)) {
      foundFmtp = true;
      // Parse existing params
      const paramsStr = line.slice(fmtpPrefix.length + 1); // skip the space
      const params = new Map<string, string>();
      for (const param of paramsStr.split(";")) {
        const [key, value] = param.trim().split("=");
        if (key && value) params.set(key, value);
      }

      // Override with high-quality settings
      params.set("maxaveragebitrate", "128000");
      params.set("stereo", "1");
      params.set("sprop-stereo", "1");

      const newParams = [...params.entries()]
        .map(([k, v]) => `${k}=${v}`)
        .join(";");
      result.push(`${fmtpPrefix} ${newParams}`);
    } else {
      result.push(line);
    }
  }

  // If no fmtp line existed for opus, add one
  if (!foundFmtp) {
    const insertLines: string[] = [];
    for (const line of result) {
      insertLines.push(line);
      if (line.startsWith(`a=rtpmap:${opusPayloadType}`)) {
        insertLines.push(
          `${fmtpPrefix} maxaveragebitrate=128000;stereo=1;sprop-stereo=1`,
        );
      }
    }
    return insertLines.join("\r\n");
  }

  return result.join("\r\n");
}
