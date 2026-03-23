"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPeerConnection, setOpusHighBitrate } from "~/lib/webrtc";
import type { ClientMessage, ServerMessage, SignalPayload } from "~/types/room";

interface PeerEntry {
  pc: RTCPeerConnection;
  name: string;
  sysAudioSender: RTCRtpSender | null;
  /** true when this peer is the polite side (lower ID receives offers) */
  polite: boolean;
  /** true while we are in the middle of an SDP exchange */
  makingOffer: boolean;
  /** track whether we should ignore an incoming offer (glare) */
  ignoreOffer: boolean;
}

interface UseWebRTCParams {
  myPeerId: string | null;
  send: (msg: ClientMessage) => void;
  micStream: MediaStream | null;
  systemAudioTrack: MediaStreamTrack | null;
  isMyTurn: boolean;
}

interface UseWebRTCReturn {
  remoteStreams: Map<string, MediaStream>;
  handleServerMessage: (msg: ServerMessage) => void;
  peerCount: number;
}

export function useWebRTC({
  myPeerId,
  send,
  micStream,
  systemAudioTrack,
  isMyTurn,
}: UseWebRTCParams): UseWebRTCReturn {
  const peersRef = useRef<Map<string, PeerEntry>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map(),
  );
  const [peerCount, setPeerCount] = useState(0);

  // Keep refs for values needed in callbacks
  const myPeerIdRef = useRef(myPeerId);
  const sendRef = useRef(send);
  const micStreamRef = useRef(micStream);
  const systemAudioTrackRef = useRef(systemAudioTrack);
  const isMyTurnRef = useRef(isMyTurn);

  useEffect(() => {
    myPeerIdRef.current = myPeerId;
  }, [myPeerId]);
  useEffect(() => {
    sendRef.current = send;
  }, [send]);
  useEffect(() => {
    micStreamRef.current = micStream;
  }, [micStream]);
  useEffect(() => {
    systemAudioTrackRef.current = systemAudioTrack;
  }, [systemAudioTrack]);
  useEffect(() => {
    isMyTurnRef.current = isMyTurn;
  }, [isMyTurn]);

  const sendSignal = useCallback((to: string, payload: SignalPayload) => {
    console.log("[WebRTC] Sending signal", payload.kind, "to", to);
    sendRef.current({ type: "signal", to, payload });
  }, []);

  const addMicTrackToConnection = useCallback(
    (pc: RTCPeerConnection) => {
      const stream = micStreamRef.current;
      if (stream) {
        const audioTrack = stream.getAudioTracks()[0];
        if (audioTrack) {
          console.log("[WebRTC] Adding mic track to peer connection");
          pc.addTrack(audioTrack, stream);
        }
      }
    },
    [],
  );

  const setupPeerConnection = useCallback(
    (peerId: string, peerName: string, polite: boolean): RTCPeerConnection => {
      const myId = myPeerIdRef.current;
      console.log("[WebRTC] Setting up peer connection for", peerId, "polite:", polite, "myId:", myId);
      const pc = createPeerConnection();

      const entry: PeerEntry = {
        pc,
        name: peerName,
        sysAudioSender: null,
        polite,
        makingOffer: false,
        ignoreOffer: false,
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          console.log("[WebRTC] ICE candidate generated for", peerId);
          sendSignal(peerId, {
            kind: "ice-candidate",
            candidate: event.candidate.toJSON(),
          });
        }
      };

      pc.ontrack = (event) => {
        console.log("[WebRTC] ontrack fired from", peerId, "track kind:", event.track.kind, "track id:", event.track.id);
        const stream = event.streams[0] ?? new MediaStream([event.track]);
        console.log("[WebRTC] Remote stream for", peerId, "tracks:", stream.getTracks().map(t => `${t.kind}:${t.id}:${t.readyState}`));
        setRemoteStreams((prev) => {
          const next = new Map(prev);
          next.set(peerId, stream);
          return next;
        });
      };

      // "Perfect negotiation" pattern: only the impolite side creates offers
      // via onnegotiationneeded. The polite side never initiates offers.
      pc.onnegotiationneeded = async () => {
        console.log("[WebRTC] onnegotiationneeded fired for", peerId, "polite:", entry.polite);
        // Only the impolite (initiator) side creates offers via onnegotiationneeded
        if (entry.polite) {
          console.log("[WebRTC] Skipping onnegotiationneeded — we are the polite side for", peerId);
          return;
        }
        try {
          entry.makingOffer = true;
          const offer = await pc.createOffer();
          // Check if the signaling state changed while we were creating the offer
          if (pc.signalingState !== "stable") {
            console.log("[WebRTC] Signaling state changed during createOffer, aborting. State:", pc.signalingState);
            return;
          }
          offer.sdp = offer.sdp ? setOpusHighBitrate(offer.sdp) : offer.sdp;
          await pc.setLocalDescription(offer);
          if (pc.localDescription?.sdp) {
            console.log("[WebRTC] Sending offer via onnegotiationneeded to", peerId);
            sendSignal(peerId, {
              kind: "offer",
              sdp: pc.localDescription.sdp,
            });
          }
        } catch (err) {
          console.error("[WebRTC] Negotiation error for", peerId, ":", err);
        } finally {
          entry.makingOffer = false;
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log("[WebRTC] ICE connection state for", peerId, ":", pc.iceConnectionState);
      };

      pc.onconnectionstatechange = () => {
        console.log("[WebRTC] Connection state for", peerId, ":", pc.connectionState);
        if (
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          console.warn(`[WebRTC] Connection to ${peerId} ${pc.connectionState}`);
        }
      };

      pc.onsignalingstatechange = () => {
        console.log("[WebRTC] Signaling state for", peerId, ":", pc.signalingState);
      };

      peersRef.current.set(peerId, entry);
      setPeerCount(peersRef.current.size);

      return pc;
    },
    [sendSignal],
  );

  const removePeer = useCallback((peerId: string) => {
    console.log("[WebRTC] Removing peer", peerId);
    const entry = peersRef.current.get(peerId);
    if (entry) {
      entry.pc.close();
      peersRef.current.delete(peerId);
      setPeerCount(peersRef.current.size);
      setRemoteStreams((prev) => {
        const next = new Map(prev);
        next.delete(peerId);
        return next;
      });
    }
  }, []);

  const handleServerMessage = useCallback(
    (msg: ServerMessage) => {
      const myId = myPeerIdRef.current;
      if (!myId) {
        console.log("[WebRTC] handleServerMessage called but myPeerId is null, msg type:", msg.type);
        return;
      }

      switch (msg.type) {
        case "peer-joined": {
          console.log("[WebRTC] peer-joined:", msg.peerId, "name:", msg.name, "myId:", myId);
          // Only the impolite peer (higher ID) sets up the connection on peer-joined.
          // The polite peer (lower ID) will set up when it receives an offer.
          const iAmImpolite = myId > msg.peerId;
          if (iAmImpolite) {
            console.log("[WebRTC] I am impolite (initiator). Creating connection and adding tracks.");
            const pc = setupPeerConnection(msg.peerId, msg.name, false);
            // Add mic track — this will trigger onnegotiationneeded which creates the offer.
            // Do NOT create an explicit offer; let onnegotiationneeded handle it.
            addMicTrackToConnection(pc);
            // If no mic track was added, onnegotiationneeded may not fire.
            // In that case, we need to create an offer manually.
            const hasMic = micStreamRef.current?.getAudioTracks()[0];
            if (!hasMic) {
              console.log("[WebRTC] No mic track available. Creating explicit offer.");
              const entry = peersRef.current.get(msg.peerId)!;
              void (async () => {
                try {
                  entry.makingOffer = true;
                  const offer = await pc.createOffer();
                  offer.sdp = offer.sdp ? setOpusHighBitrate(offer.sdp) : offer.sdp;
                  await pc.setLocalDescription(offer);
                  if (pc.localDescription?.sdp) {
                    sendSignal(msg.peerId, {
                      kind: "offer",
                      sdp: pc.localDescription.sdp,
                    });
                  }
                } catch (err) {
                  console.error("[WebRTC] Error creating initial offer:", err);
                } finally {
                  entry.makingOffer = false;
                }
              })();
            }
          } else {
            console.log("[WebRTC] I am polite (responder). Will wait for offer from", msg.peerId);
          }
          break;
        }

        case "signal": {
          const { from, payload } = msg;
          console.log("[WebRTC] Received signal", payload.kind, "from", from);

          if (payload.kind === "offer") {
            let entry = peersRef.current.get(from);
            if (!entry) {
              console.log("[WebRTC] No existing connection for", from, "— creating one (polite side)");
              const pc = setupPeerConnection(from, "", true);
              addMicTrackToConnection(pc);
              entry = peersRef.current.get(from)!;
            }

            const { pc } = entry;

            // Perfect negotiation: handle glare
            const offerCollision =
              entry.makingOffer || pc.signalingState !== "stable";

            entry.ignoreOffer = !entry.polite && offerCollision;
            if (entry.ignoreOffer) {
              console.log("[WebRTC] Ignoring colliding offer from", from, "(we are impolite, signalingState:", pc.signalingState, ")");
              break;
            }

            console.log("[WebRTC] Processing offer from", from, "signalingState:", pc.signalingState);

            void (async () => {
              try {
                // If we're not stable, rollback first (polite side)
                if (pc.signalingState !== "stable") {
                  console.log("[WebRTC] Rolling back local description for", from);
                  await Promise.all([
                    pc.setLocalDescription({ type: "rollback" }),
                    pc.setRemoteDescription(
                      new RTCSessionDescription({ type: "offer", sdp: payload.sdp }),
                    ),
                  ]);
                } else {
                  await pc.setRemoteDescription(
                    new RTCSessionDescription({ type: "offer", sdp: payload.sdp }),
                  );
                }
                const answer = await pc.createAnswer();
                answer.sdp = answer.sdp
                  ? setOpusHighBitrate(answer.sdp)
                  : answer.sdp;
                await pc.setLocalDescription(answer);
                if (pc.localDescription?.sdp) {
                  console.log("[WebRTC] Sending answer to", from);
                  sendSignal(from, {
                    kind: "answer",
                    sdp: pc.localDescription.sdp,
                  });
                }
              } catch (err) {
                console.error("[WebRTC] Error handling offer from", from, ":", err);
              }
            })();
            break;
          }

          if (payload.kind === "answer") {
            const entry = peersRef.current.get(from);
            if (entry) {
              console.log("[WebRTC] Setting remote answer from", from, "signalingState:", entry.pc.signalingState);
              void entry.pc
                .setRemoteDescription(
                  new RTCSessionDescription({
                    type: "answer",
                    sdp: payload.sdp,
                  }),
                )
                .catch((err: unknown) =>
                  console.error("[WebRTC] Error setting answer from", from, ":", err),
                );
            } else {
              console.warn("[WebRTC] Received answer from unknown peer", from);
            }
            break;
          }

          if (payload.kind === "ice-candidate") {
            const entry = peersRef.current.get(from);
            if (entry) {
              console.log("[WebRTC] Adding ICE candidate from", from);
              void entry.pc
                .addIceCandidate(new RTCIceCandidate(payload.candidate))
                .catch((err: unknown) =>
                  console.error("[WebRTC] Error adding ICE candidate from", from, ":", err),
                );
            } else {
              console.warn("[WebRTC] Received ICE candidate from unknown peer", from);
            }
            break;
          }

          break;
        }

        case "peer-left": {
          console.log("[WebRTC] peer-left:", msg.peerId);
          removePeer(msg.peerId);
          break;
        }

        default:
          break;
      }
    },
    [setupPeerConnection, addMicTrackToConnection, removePeer, sendSignal],
  );

  // When micStream changes, add or replace mic track on all existing connections
  useEffect(() => {
    const newTrack = micStream?.getAudioTracks()[0] ?? null;
    console.log("[WebRTC] micStream changed. newTrack:", newTrack ? `${newTrack.id} (${newTrack.readyState})` : "null", "peers:", peersRef.current.size);

    for (const [peerId, entry] of peersRef.current) {
      const { pc } = entry;
      const senders = pc.getSenders();

      // Find existing mic sender — it's any audio sender that is NOT the system audio sender
      const micSender = senders.find(
        (s) =>
          s.track?.kind === "audio" &&
          s !== entry.sysAudioSender,
      );

      // Also check for a sender with no track (removed mic)
      const emptySender = senders.find(
        (s) =>
          s.track === null &&
          s !== entry.sysAudioSender,
      );

      if (micSender && newTrack) {
        console.log("[WebRTC] Replacing mic track on connection to", peerId);
        void micSender.replaceTrack(newTrack).catch((err: unknown) => {
          console.error("[WebRTC] Error replacing mic track for", peerId, ":", err);
        });
      } else if (!micSender && emptySender && newTrack) {
        console.log("[WebRTC] Replacing null track with mic track on connection to", peerId);
        void emptySender.replaceTrack(newTrack).catch((err: unknown) => {
          console.error("[WebRTC] Error replacing empty sender with mic track for", peerId, ":", err);
        });
      } else if (!micSender && !emptySender && newTrack && micStream) {
        console.log("[WebRTC] Adding new mic track to connection to", peerId);
        // No existing sender — add the track (triggers renegotiation via onnegotiationneeded)
        pc.addTrack(newTrack, micStream);
      } else if (micSender && !newTrack) {
        console.log("[WebRTC] Removing mic track from connection to", peerId);
        // Mic disconnected — remove the sender
        pc.removeTrack(micSender);
      }
    }
  }, [micStream]);

  // When systemAudioTrack or isMyTurn changes, add/remove system audio
  useEffect(() => {
    console.log("[WebRTC] System audio effect. isMyTurn:", isMyTurn, "systemAudioTrack:", systemAudioTrack ? `${systemAudioTrack.id} (${systemAudioTrack.readyState})` : "null", "peers:", peersRef.current.size);

    for (const [peerId, entry] of peersRef.current) {
      const { pc } = entry;

      if (isMyTurn && systemAudioTrack) {
        if (entry.sysAudioSender) {
          console.log("[WebRTC] Replacing system audio track on connection to", peerId);
          void entry.sysAudioSender
            .replaceTrack(systemAudioTrack)
            .catch((err: unknown) =>
              console.error("[WebRTC] Error replacing system audio track for", peerId, ":", err),
            );
        } else {
          console.log("[WebRTC] Adding system audio track to connection to", peerId);
          // Add new system audio track — create a stream wrapper for it
          const sysStream = new MediaStream([systemAudioTrack]);
          const sender = pc.addTrack(systemAudioTrack, sysStream);
          entry.sysAudioSender = sender;
          // onnegotiationneeded will fire automatically on the impolite side.
          // On the polite side, we need to trigger negotiation manually since
          // our onnegotiationneeded skips offer creation.
          if (entry.polite) {
            console.log("[WebRTC] Polite side added system audio track — need to signal impolite side to renegotiate");
            // The polite side can't initiate offers. The impolite side needs to
            // detect the new track. But since we're adding the track locally,
            // onnegotiationneeded fires on OUR pc. Since we skip it (polite),
            // we need the impolite peer to also add or know about the track.
            // Actually, addTrack on the polite side will still fire onnegotiationneeded.
            // We DO need to create an offer here because the remote peer won't know
            // about our new track otherwise. Let's make an exception for system audio:
            // the polite side sends an offer when it adds a system audio track.
            void (async () => {
              try {
                entry.makingOffer = true;
                const offer = await pc.createOffer();
                if (pc.signalingState !== "stable") {
                  console.log("[WebRTC] Signaling not stable during sys audio offer, aborting");
                  return;
                }
                offer.sdp = offer.sdp ? setOpusHighBitrate(offer.sdp) : offer.sdp;
                await pc.setLocalDescription(offer);
                if (pc.localDescription?.sdp) {
                  console.log("[WebRTC] Polite side sending offer (system audio) to", peerId);
                  sendSignal(peerId, {
                    kind: "offer",
                    sdp: pc.localDescription.sdp,
                  });
                }
              } catch (err) {
                console.error("[WebRTC] Error creating system audio offer:", err);
              } finally {
                entry.makingOffer = false;
              }
            })();
          }
        }
      } else if (entry.sysAudioSender) {
        console.log("[WebRTC] Removing system audio track from connection to", peerId);
        pc.removeTrack(entry.sysAudioSender);
        entry.sysAudioSender = null;
        // Same issue: polite side needs to renegotiate when removing
        if (entry.polite) {
          void (async () => {
            try {
              entry.makingOffer = true;
              const offer = await pc.createOffer();
              if (pc.signalingState !== "stable") {
                return;
              }
              offer.sdp = offer.sdp ? setOpusHighBitrate(offer.sdp) : offer.sdp;
              await pc.setLocalDescription(offer);
              if (pc.localDescription?.sdp) {
                console.log("[WebRTC] Polite side sending offer (remove sys audio) to", peerId);
                sendSignal(peerId, {
                  kind: "offer",
                  sdp: pc.localDescription.sdp,
                });
              }
            } catch (err) {
              console.error("[WebRTC] Error creating remove sys audio offer:", err);
            } finally {
              entry.makingOffer = false;
            }
          })();
        }
      }
    }
  }, [systemAudioTrack, isMyTurn, sendSignal]);

  // Clean up all connections on unmount
  useEffect(() => {
    return () => {
      console.log("[WebRTC] Cleaning up all peer connections");
      for (const [, { pc }] of peersRef.current) {
        pc.close();
      }
      peersRef.current.clear();
    };
  }, []);

  return { remoteStreams, handleServerMessage, peerCount };
}
