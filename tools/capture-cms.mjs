import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE});
try {
  const desktop=await browser.newPage({viewport:{width:1440,height:900},reducedMotion:'reduce'});
  const mobile=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce',isMobile:true,deviceScaleFactor:1,hasTouch:true});
  const origin='http://127.0.0.1:5186';
  await mkdir('qa',{recursive:true});
  for(const [page,name] of [[desktop,'desktop'],[mobile,'mobile']]){
    await page.goto(origin+'/admin/?preview=local',{waitUntil:'domcontentloaded'});
    await page.locator('.heading h1, .gate h1').first().waitFor();
    await page.screenshot({path:'qa/studio-'+name+'.png',animations:'disabled'});
  }
  console.log('Captured desktop and mobile studio previews.');
} finally {await browser.close();}
