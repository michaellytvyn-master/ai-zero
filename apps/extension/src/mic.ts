/**
 * Chrome will not show the microphone prompt from inside a side panel, so this
 * one-purpose page asks for it. Once granted, the panel can record without
 * asking again.
 */
const root = document.getElementById('root')

function say(html: string): void {
  if (root !== null) root.innerHTML = html
}

const style = `
  font: 15px/1.5 ui-sans-serif, system-ui, sans-serif;
  max-width: 30rem; margin: 3rem auto; padding: 0 1rem;
`
document.body.setAttribute('style', style)

say('<h2>Allow the microphone</h2><p>Chrome should be asking now.</p>')

navigator.mediaDevices
  .getUserMedia({ audio: true })
  .then((stream) => {
    // Access is what was wanted, not the audio; release the device at once so
    // no recording indicator is left running.
    for (const track of stream.getTracks()) track.stop()
    say(
      '<h2>Microphone allowed</h2><p>You can close this tab and use the voice button in the side panel.</p>',
    )
  })
  .catch(() => {
    say(
      '<h2>Microphone refused</h2><p>Voice input needs it. You can change this under the padlock in the address bar, then reload this page.</p>',
    )
  })
