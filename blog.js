// Newsletter-Anmeldung (Double-Opt-in) – wird auf allen Blog-Seiten genutzt.
function nlSub(e){
  e.preventDefault();
  var m=document.getElementById('nlm');
  var email=document.getElementById('nle').value;
  m.style.color='#586069';
  m.textContent='Senden…';
  fetch('/api/newsletter-subscribe',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({email:email})
  }).then(function(r){return r.json();}).then(function(d){
    m.style.color=d.ok?'#1a7f37':'#cf222e';
    m.textContent=d.ok?' Fast geschafft – bitte bestätige die Anmeldung über den Link in deiner E-Mail.':(d.error||'Es ist ein Fehler aufgetreten.');
    if(d.ok){var f=document.getElementById('nlf'); if(f) f.reset();}
  }).catch(function(){ m.style.color='#cf222e'; m.textContent='Netzwerkfehler – bitte später erneut versuchen.'; });
  return false;
}
