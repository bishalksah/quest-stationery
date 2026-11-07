/* Start: resume an existing session or show the sign-in page */
(() => {
  if (Q.token) Q.api('/me').then(u => Q.enter(u)).catch(() => Q.signOut());
  else Q.signOut();
})();
