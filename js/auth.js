import { uid } from "./utils.js";
import { getProfile, setProfile, clearProfile } from "./storage.js";

export function isLoggedIn(){
  return !!getProfile();
}

export function logout(){
  clearProfile();
}

export function googleSignInStub(){
  // Stub: simule un login Google (à remplacer par OAuth réel)
  const profile = getProfile() || {};
  const merged = {
    ...profile,
    google: { connected: true, provider: "google_stub" },
    accountId: profile.accountId || uid(),
  };
  setProfile(merged);
  return merged;
}
