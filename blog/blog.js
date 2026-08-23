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
  }).then(function(r){
    // Antwort kann bei einem Serverfehler auch HTML sein -> nicht blind als JSON lesen
    return r.text().then(function(t){
      var d={}; try{ d=JSON.parse(t); }catch(e){ d={ error:'Serverfehler (HTTP '+r.status+')' }; }
      if(!r.ok && !d.error) d.error='Serverfehler (HTTP '+r.status+')';
      if(r.status===404) d.error='Newsletter-Funktion nicht gefunden (HTTP 404).';
      return d;
    });
  }).then(function(d){
    m.style.color=d.ok?'#1a7f37':'#cf222e';
    m.textContent=d.ok?'Fast geschafft – bitte bestätige die Anmeldung über den Link in deiner E-Mail.':(d.error||'Es ist ein Fehler aufgetreten.');
    if(d.ok){var f=document.getElementById('nlf'); if(f) f.reset();}
  }).catch(function(err){ m.style.color='#cf222e'; m.textContent='Keine Verbindung zum Server.'; console.error('[SR] newsletter', err); });
  return false;
}
