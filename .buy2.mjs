import { chromium } from 'playwright';
const BASE='https://custom-canvas-chi.vercel.app';
const LISTING=process.argv[2], CARD=process.argv[3], TAG=process.argv[4]||'run';
const SHOT='/private/tmp/claude-501/-Users-christopherrandall/dea60f45-fb2f-4416-a2be-fefbdcdb766f/scratchpad';
const b=await chromium.launch(); const page=await b.newPage();
const log=(...a)=>console.log('  ',...a);
const fill=async(s,v)=>{const e=page.locator(s).first(); if(await e.count()){await e.fill(v);return true;} return false;};
try{
  await page.goto(`${BASE}/login`,{waitUntil:'networkidle'});
  await page.waitForTimeout(4000);
  const cb=page.locator('button:has-text("Accept")').first(); if(await cb.count()) await cb.click().catch(()=>{});
  for(let i=0;i<4;i++){
    await page.fill('input[type=email]','buyer.test@customcanvas.dev');
    await page.fill('input[type=password]','TestPass123!');
    await page.waitForTimeout(1200);
    if(await page.inputValue('input[type=email]') && await page.inputValue('input[type=password]')) break;
  }
  await page.click('button[type=submit]');
  await page.waitForURL(u=>!u.pathname.includes('/login'),{timeout:30000});
  log('signed in');

  await page.goto(`${BASE}/checkout/${LISTING}`,{waitUntil:'domcontentloaded'});
  await page.waitForTimeout(3000);
  await page.click('button:has-text("Pay")');
  await page.waitForURL(/checkout\.stripe\.com/,{timeout:45000});
  await page.waitForTimeout(7000);
  log('on Stripe page');

  await fill('input[name=email]','buyer.test@customcanvas.dev');
  await fill('input[name=cardNumber]',CARD);
  await fill('input[name=cardExpiry]','12'+String(new Date().getFullYear()+3).slice(-2));
  await fill('input[name=cardCvc]','123');
  await fill('input[name=billingName]','Dana Buyer');
  // shipping address: type then take the Google suggestion (it closes the overlay)
  await fill('input[name=shippingName]','Dana Buyer');
  const l1=page.locator('input[name=shippingAddressLine1]').first();
  if(await l1.count()){
    await l1.fill('1200 McKinney St'); await page.waitForTimeout(2500);
    const s=page.locator('text=/Houston, TX, USA/').first();
    if(await s.count()){ await s.click(); log('picked address suggestion'); await page.waitForTimeout(3000); }
  }
  const pass=page.locator('input[name=enableStripePass]').first();
  if(await pass.count() && await pass.isChecked()){ await pass.uncheck(); log('unchecked save-my-info'); }
  await page.waitForTimeout(2500);
  const txt=await page.textContent('body');
  const tax=txt.match(/Sales Tax[^$]{0,20}\$([0-9,.]+)/i);
  log('TAX:', tax?tax[0].replace(/\s+/g,' '):'not found');
  await page.screenshot({path:`${SHOT}/${TAG}-before-pay.png`,fullPage:true});

  await page.click('button[type=submit]');
  await page.waitForURL(/\/orders/,{timeout:120000});
  log('RETURNED:',page.url());
  await page.waitForTimeout(4000);
  await page.screenshot({path:`${SHOT}/${TAG}-orders.png`,fullPage:true});
  log('success banner:', /successful/i.test(await page.textContent('body'))?'YES':'no');
}catch(e){
  log('ERROR:',e.message.split('\n')[0]); log('url:',page.url());
  await page.screenshot({path:`${SHOT}/${TAG}-error.png`,fullPage:true}).catch(()=>{});
}finally{await b.close();}
