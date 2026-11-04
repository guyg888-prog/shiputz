/* Unified media preview and editor for inspirations and renderings. */
(function(){
let items=[],allItems=[],activeRoom="",index=0,originalFocus=null,editOpen=false,dirty=false,pendingImage=null,working=false;
const $=id=>document.getElementById(id);
function escapeHTML(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function current(){return items[index]}
function shell(){
 let root=$('mediaLightbox');if(root){root.remove()}
 root=document.createElement('div');root.id='mediaLightbox';root.className='media-lightbox media-editor-lightbox';root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.setAttribute('aria-label','תצוגת תמונה ועריכה');
 root.innerHTML='<div class="media-viewer-shell"><header class="media-viewer-header"><div class="media-viewer-heading"><strong id="mediaViewerTitle">תצוגת תמונה</strong><label class="media-room-picker-label" for="mediaViewerRoom">חדר</label><select id="mediaViewerRoom" aria-label="בחירת חדר לתצוגה" onchange="changeMediaGalleryRoom(this.value)"></select><span id="mediaViewerCount"></span></div><div class="media-viewer-tools"><button type="button" id="mediaEditToggle" onclick="toggleMediaEdit()">✎ עריכה</button><button type="button" class="media-viewer-close" aria-label="סגירה" onclick="closeMediaGallery()">×</button></div></header><div class="media-viewer-content"><div class="media-viewer-stage"><button type="button" class="media-nav-arrow" aria-label="תמונה קודמת" onclick="moveMediaGallery(-1)">❮</button><div class="media-viewer-photo"><img id="lightboxImage" alt=""><div id="lightboxCaption"></div></div><button type="button" class="media-nav-arrow" aria-label="תמונה הבאה" onclick="moveMediaGallery(1)">❯</button></div><aside class="media-edit-pane" id="mediaEditPane" hidden><h3>עריכת תמונה</h3><form id="mediaEditForm" onsubmit="saveMediaGalleryEdit(event)"><label>חדר<select name="room" id="mediaEditRoom"></select></label><label>הערות<textarea name="notes" id="mediaEditNotes" rows="4"></textarea></label><label>קישור למקור<input name="url" id="mediaEditUrl" type="url" placeholder="https://..."></label><label class="media-upload-label">החלפת תמונה<input type="file" id="mediaEditFile" accept="image/jpeg,image/png,image/webp" onchange="mediaGalleryFileChanged(this)"><small id="mediaFileStatus">אפשר לבחור תמונה חדשה</small></label><div class="media-edit-actions"><button type="button" class="media-delete" onclick="deleteMediaGalleryItem()">מחיקה</button><button type="submit" class="media-save" id="mediaGallerySave">שמירת שינויים</button></div></form></aside></div></div>';
 root.addEventListener('click',e=>{if(e.target===root)closeMediaGallery()});document.body.appendChild(root);return root;
}
function fillEditor(){const item=current();if(!item)return;const select=$('mediaEditRoom');select.innerHTML=rooms.map(r=>'<option value="'+escapeHTML(r[0])+'">'+escapeHTML(r[0])+'</option>').join('');select.value=item.room||'';$('mediaEditNotes').value=item.notes||'';$('mediaEditUrl').value=item.url||'';$('mediaEditFile').value='';$('mediaFileStatus').textContent='אפשר לבחור תמונה חדשה';pendingImage=null;dirty=false}
function show(){const item=current();if(!item)return;const picker=$('mediaViewerRoom');if(picker){const available=[...new Set(allItems.map(x=>x.room))];picker.innerHTML=available.map(room=>'<option value="'+escapeHTML(room)+'">'+escapeHTML(room||'ללא חדר')+'</option>').join('');picker.value=activeRoom;}$('lightboxImage').src=item.src;$('lightboxImage').alt=item.title||item.room||'תמונה';$('lightboxCaption').textContent=item.room||'';$('mediaViewerTitle').textContent=item.kind==='renders'?'ספריית הדמיות':'ספריית השראות';$('mediaViewerCount').textContent=(index+1)+' / '+items.length;document.querySelectorAll('.media-nav-arrow').forEach(b=>b.hidden=items.length<2);fillEditor();$('mediaEditPane').hidden=!editOpen;$('mediaEditToggle').setAttribute('aria-expanded',String(editOpen));$('mediaEditToggle').classList.toggle('active',editOpen)}
function askDiscard(){return !dirty||confirm('יש שינויים שלא נשמרו. להמשיך בלי לשמור?')}
window.openMediaGallery=async function(cover,editing=false){
 const selectedCard=cover.closest('.inspo-card');if(!selectedCard)return;
 const selectedId=selectedCard.dataset.mediaId,kind=selectedCard.dataset.mediaKind||'inspo';
 const source=selectedCard.closest('#inspoCards')||selectedCard.parentElement;
 const cards=Array.from(source.querySelectorAll('.inspo-card'));
 const cardItems=cards.map(card=>{const img=card.querySelector('.inspo-cover img');return img?{id:card.dataset.mediaId,kind:card.dataset.mediaKind||'inspo',src:img.src,title:img.alt,room:card.querySelector('.inspo-label')?.textContent||'',notes:card.dataset.mediaNotes||'',url:card.dataset.mediaUrl||''}:null}).filter(Boolean);
 // Library rails may be filtered by room/search: load the full library to allow jumping to other rooms.
 allItems=cardItems;
 if(source.id==='inspoCards'){
  try{
   const stored=(await dbAll()).filter(x=>(x.kind||'inspo')===kind);
   allItems=stored.slice().reverse().map(x=>({id:String(x.id),kind,src:x.image||(/^https?:\\/\\//i.test(x.url||'')?x.url:''),title:x.title||'',room:x.room||'',notes:x.notes||'',url:x.url||''})).filter(x=>x.src);
  }catch(e){allItems=cardItems}
 }
 const chosen=allItems.find(x=>x.id===selectedId);
 if(!chosen){allItems=cardItems}
 activeRoom=(allItems.find(x=>x.id===selectedId)||cardItems.find(x=>x.id===selectedId))?.room||'';
 items=allItems.filter(x=>x.room===activeRoom);
 index=Math.max(0,items.findIndex(x=>x.id===selectedId));
 if(!items.length)return;
 originalFocus=document.activeElement;editOpen=editing;dirty=false;shell().style.display='flex';
 document.body.classList.add('lightbox-open');show();document.querySelector('.media-viewer-close').focus()
};
window.changeMediaGalleryRoom=function(room){
 if(working||!askDiscard()){$('mediaViewerRoom').value=activeRoom;return}
 const next=allItems.filter(x=>x.room===room);
 if(!next.length){$('mediaViewerRoom').value=activeRoom;return}
 activeRoom=room;items=next;index=0;show();
};
window.openMediaGalleryEditor=function(button){const card=button.closest('.inspo-card');const cover=card?.querySelector('.inspo-cover');if(cover)openMediaGallery(cover,true)};
window.toggleMediaEdit=function(){editOpen=!editOpen;$('mediaEditPane').hidden=!editOpen;$('mediaEditToggle').setAttribute('aria-expanded',String(editOpen));$('mediaEditToggle').classList.toggle('active',editOpen);if(editOpen)$('mediaEditRoom').focus()};
window.moveMediaGallery=function(delta){if(!items.length||working||!askDiscard())return;index=(index+delta+items.length)%items.length;show()};
window.closeMediaGallery=function(){if(working||!askDiscard())return;const root=$('mediaLightbox');if(root)root.remove();document.body.classList.remove('lightbox-open');if(originalFocus?.isConnected)originalFocus.focus();dirty=false};
window.mediaGalleryFileChanged=async function(input){if(!input.files?.[0])return;try{pendingImage=await readMediaFile(input.files[0]);$('lightboxImage').src=pendingImage;$('mediaFileStatus').textContent='התמונה החדשה מוכנה לשמירה';dirty=true}catch(e){input.value='';alert(e.message)}};
window.saveMediaGalleryEdit=async function(e){e.preventDefault();if(working)return;const item=current();if(!item?.id)return;working=true;$('mediaGallerySave').disabled=true;try{const existing=(await dbAll()).find(x=>x.id===item.id);if(!existing)throw Error('התמונה לא נמצאה');const obj={...existing,room:$('mediaEditRoom').value,notes:$('mediaEditNotes').value,url:$('mediaEditUrl').value,updatedAt:new Date().toISOString()};if(pendingImage)obj.image=pendingImage;await dbPut(obj);item.room=obj.room;activeRoom=obj.room;item.notes=obj.notes;item.url=obj.url;if(pendingImage)item.src=pendingImage;dirty=false;pendingImage=null;items=allItems.filter(x=>x.room===activeRoom);index=Math.max(0,items.findIndex(x=>x.id===item.id));showToast('התמונה נשמרה');show();render()}catch(err){alert('השמירה נכשלה: '+err.message)}finally{working=false;const b=$('mediaGallerySave');if(b)b.disabled=false}};
window.deleteMediaGalleryItem=async function(){const item=current();if(!item||working||!confirm('למחוק את התמונה?'))return;working=true;try{await dbDelete(item.id);dirty=false;allItems=allItems.filter(x=>x.id!==item.id);items=allItems.filter(x=>x.room===activeRoom);showToast('התמונה נמחקה');if(!items.length){working=false;closeMediaGallery()}else{index=Math.min(index,items.length-1);show()}render()}catch(e){alert('המחיקה נכשלה: '+e.message)}finally{working=false}};
document.addEventListener('input',e=>{if(e.target.closest?.('#mediaEditForm'))dirty=true});
document.addEventListener('change',e=>{if(e.target.closest?.('#mediaEditForm')&&e.target.id!=='mediaEditFile')dirty=true});
document.addEventListener('keydown',e=>{if(!$('mediaLightbox'))return;if(e.key==='Escape'){e.preventDefault();closeMediaGallery()}else if(!e.target.closest('#mediaEditForm')&&(e.key==='ArrowLeft'||e.key==='ArrowRight')){e.preventDefault();moveMediaGallery(e.key==='ArrowLeft'?-1:1)}else if(e.key==='Tab'){const buttons=Array.from($('mediaLightbox').querySelectorAll('button:not([hidden]):not(:disabled),input:not([disabled]),textarea:not([disabled]),select:not([disabled])')).filter(x=>x.getClientRects().length);if(buttons.length){if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons[buttons.length-1].focus()}else if(!e.shiftKey&&document.activeElement===buttons[buttons.length-1]){e.preventDefault();buttons[0].focus()}}}});
})();