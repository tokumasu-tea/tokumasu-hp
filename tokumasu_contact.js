(() => {
  'use strict';

  const form = document.querySelector('#contact-form');
  if (!form) return;

  const lang = document.documentElement.lang === 'ja' ? 'ja' : 'en';
  const copy = {
    ja: { required:'この項目は必須です', email:'正しいメールアドレスを入力してください', mismatch:'メールアドレスが一致しません', phone:'正しい電話番号を入力してください', furigana:'全角カタカナで入力してください', address2Required:'ご住所2（町名・番地）を入力してください', address2Incomplete:'番地までご記入ください', sending:'送信中…', submit:'送信する', failure:'送信できませんでした。しばらくしてからもう一度お試しいただくか、tokumasullc@gmail.com まで直接メールをお送りください。' },
    en: { required:'This field is required.', email:'Please enter a valid email address.', mismatch:'Email addresses do not match.', phone:'Please enter a valid phone number.', furigana:'Please enter full-width katakana.', address2Required:'This field is required.', address2Incomplete:'Please include your street or block number.', sending:'Sending…', submit:'Send', failure:'Your message could not be sent. Please try again in a moment, or email us directly at tokumasullc@gmail.com.' }
  }[lang];
  const prefecturesJa = ['北海道','青森県','岩手県','宮城県','秋田県','山形県','福島県','茨城県','栃木県','群馬県','埼玉県','千葉県','東京都','神奈川県','新潟県','富山県','石川県','福井県','山梨県','長野県','岐阜県','静岡県','愛知県','三重県','滋賀県','京都府','大阪府','兵庫県','奈良県','和歌山県','鳥取県','島根県','岡山県','広島県','山口県','徳島県','香川県','愛媛県','高知県','福岡県','佐賀県','長崎県','熊本県','大分県','宮崎県','鹿児島県','沖縄県'];
  const prefecturesEn = ['Hokkaido','Aomori','Iwate','Miyagi','Akita','Yamagata','Fukushima','Ibaraki','Tochigi','Gunma','Saitama','Chiba','Tokyo','Kanagawa','Niigata','Toyama','Ishikawa','Fukui','Yamanashi','Nagano','Gifu','Shizuoka','Aichi','Mie','Shiga','Kyoto','Osaka','Hyogo','Nara','Wakayama','Tottori','Shimane','Okayama','Hiroshima','Yamaguchi','Tokushima','Kagawa','Ehime','Kochi','Fukuoka','Saga','Nagasaki','Kumamoto','Oita','Miyazaki','Kagoshima','Okinawa'];
  const $ = (selector) => form.querySelector(selector);
  const fields = ['name','furigana','inquiry','email','email_confirm','phone','country','postal_code','prefecture','address1','address2','consent'].filter((name) => form.elements[name]);
  const FURIGANA_RE = /^[ァ-ヶー　 ]*$/;
  const views = { input:$('#step-input'), confirm:$('#step-confirm'), done:$('#step-done') };
  const stepEls = [...document.querySelectorAll('.step')];
  let lastPostal = '';
  let autoFilledAddress2 = '';

  if (lang === 'ja') {
    [...form.elements.prefecture.options].find((option) => option.text === 'Outside Japan')?.remove();
    const outside = [...form.elements.prefecture.options].find((option) => option.text === '日本国外');
    if (outside) outside.value = 'Outside Japan';
  }

  function showError(name, message) {
    const input = form.elements[name];
    const error = form.querySelector(`[data-error-for="${name}"]`);
    if (input) input.setAttribute('aria-invalid','true');
    if (error) { error.textContent = message; error.classList.add('is-visible'); }
  }
  function clearError(name) {
    const input = form.elements[name];
    const error = form.querySelector(`[data-error-for="${name}"]`);
    if (input) input.removeAttribute('aria-invalid');
    if (error) error.classList.remove('is-visible');
  }
  function isValidEmail(value) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }
  function toKatakana(value) { return value.replace(/[ぁ-ゖ]/g,(ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60)); }
  function validPhone() {
    const value = form.elements.phone.value.trim();
    const digits = value.replace(/\D/g,'');
    if (form.elements.country.value === 'Japan') return /^[0-9-]+$/.test(value) && digits.length >= 10 && digits.length <= 11 && !/^(\d)\1+$/.test(digits);
    return /^\+?[0-9\s-]+$/.test(value) && digits.length >= 7 && digits.length <= 15 && !/^(\d)\1+$/.test(digits);
  }
  function validate() {
    fields.forEach(clearError);
    const errors = [];
    fields.forEach((name) => {
      const input = form.elements[name];
      const empty = input.type === 'checkbox' ? !input.checked : !input.value.trim();
      if (empty) { showError(name, name === 'address2' ? copy.address2Required : copy.required); errors.push(input); }
    });
    if (form.elements.furigana && form.elements.furigana.value && !FURIGANA_RE.test(form.elements.furigana.value)) { showError('furigana',copy.furigana); errors.push(form.elements.furigana); }
    if (form.elements.address2.value.trim() && autoFilledAddress2 && form.elements.address2.value === autoFilledAddress2) { showError('address2',copy.address2Incomplete); errors.push(form.elements.address2); }
    if (form.elements.email.value && !isValidEmail(form.elements.email.value)) { showError('email',copy.email); errors.push(form.elements.email); }
    if (form.elements.email_confirm.value && form.elements.email.value !== form.elements.email_confirm.value) { showError('email_confirm',copy.mismatch); errors.push(form.elements.email_confirm); }
    if (form.elements.phone.value && !validPhone()) { showError('phone',copy.phone); errors.push(form.elements.phone); }
    if (form.elements.country.value !== 'Japan') {
      clearError('postal_code'); clearError('prefecture');
      const outsideErrors = errors.filter((el) => !['postal_code','prefecture'].includes(el.name));
      errors.length = 0; errors.push(...outsideErrors);
    }
    if (errors.length) { errors[0].scrollIntoView({behavior:'smooth',block:'center'}); errors[0].focus({preventScroll:true}); return false; }
    return true;
  }
  function setStep(number) {
    Object.values(views).forEach((view) => { view.hidden = true; });
    const key = number === 1 ? 'input' : number === 2 ? 'confirm' : 'done';
    views[key].hidden = false;
    stepEls.forEach((el,index) => el.classList.toggle('is-current',index === number - 1));
    document.querySelector('.steps').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function updateAddressMode() {
    const country = form.elements.country.value;
    const japan = country === 'Japan';
    const prefecture = form.elements.prefecture;
    form.elements.postal_code.required = japan;
    prefecture.required = japan;
    prefecture.disabled = !japan;
    if (!country) prefecture.value = '';
    else if (!japan) prefecture.value = 'Outside Japan';
    else if (prefecture.value === 'Outside Japan') prefecture.value = '';
    clearError('postal_code'); clearError('prefecture'); clearError('phone');
  }
  async function lookupPostalCode() {
    if (form.elements.country.value !== 'Japan') return;
    const zipcode = form.elements.postal_code.value.replace(/\D/g,'');
    if (zipcode.length !== 7) {
      lastPostal = '';
      return;
    }
    if (zipcode === lastPostal) return;
    lastPostal = zipcode;
    try {
      const response = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${zipcode}`);
      if (!response.ok) return;
      const data = await response.json();
      const result = data.results && data.results[0];
      if (!result) return;
      if (form.elements.postal_code.value.replace(/\D/g,'') !== zipcode) return;
      form.elements.prefecture.value = lang === 'ja' ? result.address1 : (prefecturesEn[prefecturesJa.indexOf(result.address1)] || '');
      form.elements.address1.value = result.address2 || '';
      form.elements.address2.value = result.address3 || '';
      autoFilledAddress2 = form.elements.address2.value;
    } catch (_) { /* Manual entry remains available. */ }
  }
  function fillConfirmation() {
    const labels = {
      name: lang === 'ja' ? 'お名前' : 'Name',
      ...(form.elements.furigana ? { furigana: lang === 'ja' ? 'フリガナ' : 'Furigana' } : {}),
      inquiry: lang === 'ja' ? 'お問い合わせ内容' : 'Your inquiry', email: lang === 'ja' ? 'メールアドレス' : 'Email address', phone: lang === 'ja' ? '電話番号' : 'Phone number', country: lang === 'ja' ? '国' : 'Country', postal_code: lang === 'ja' ? '郵便番号' : 'Postal code', prefecture: lang === 'ja' ? '都道府県' : 'Prefecture', address1: lang === 'ja' ? 'ご住所1（市区町村郡）' : 'Address line 1 (City / Ward)', address2: lang === 'ja' ? 'ご住所2（町名・番地）' : 'Address line 2 (Street, block, number)', address3: lang === 'ja' ? 'ご住所3（マンション・ビル名・部屋番号）' : 'Address line 3 (Building name, room number)'
    };
    const tbody = $('#confirmation-body'); tbody.replaceChildren();
    Object.entries(labels).forEach(([name,label]) => {
      const tr = document.createElement('tr'); const th = document.createElement('th'); const td = document.createElement('td');
      th.textContent = label; td.textContent = form.elements[name].value || '—'; tr.append(th,td); tbody.append(tr);
    });
  }
  function payload() {
    const data = new FormData();
    ['name','furigana','inquiry','email','phone','country','postal_code','prefecture','address1','address2','address3','lang','_template','_honey'].filter((name) => form.elements[name]).forEach((name) => data.append(name,form.elements[name].value));
    data.append('_replyto',form.elements.email.value);
    data.append('_subject',lang === 'ja' ? `【徳増HP】お問い合わせ：${form.elements.name.value}様` : `[Tokumasu website] Inquiry from ${form.elements.name.value}`);
    return data;
  }

  fields.concat(['address3']).forEach((name) => form.elements[name].addEventListener('input',() => clearError(name)));
  if (form.elements.furigana) {
    form.elements.furigana.addEventListener('input',() => {
      const input = form.elements.furigana;
      const converted = toKatakana(input.value);
      if (converted !== input.value) {
        const pos = input.selectionStart;
        input.value = converted;
        input.setSelectionRange(pos,pos);
      }
    });
  }
  form.elements.country.addEventListener('change',updateAddressMode);
  form.elements.postal_code.addEventListener('input',lookupPostalCode);
  $('#to-confirm').addEventListener('click',() => { if (validate()) { fillConfirmation(); setStep(2); } });
  $('#back-to-input').addEventListener('click',() => setStep(1));
  form.addEventListener('submit',async (event) => {
    event.preventDefault();
    const button = $('#submit-button'); const error = $('#submit-error'); error.hidden = true; button.disabled = true; button.textContent = copy.sending;
    try {
      const response = await fetch(form.action,{method:'POST',body:payload(),headers:{Accept:'application/json'}});
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === 'false') throw new Error('Submission failed');
      form.reset(); updateAddressMode(); setStep(3);
    } catch (_) { error.textContent = copy.failure; error.hidden = false; }
    finally { button.disabled = false; button.textContent = copy.submit; }
  });
  updateAddressMode();
})();
