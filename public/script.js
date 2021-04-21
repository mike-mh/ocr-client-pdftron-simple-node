const updatePage = pn => document.getElementById('page-marker').innerHTML = !!pn ? 'Running OCR on Page: ' + pn : '';
const updateProgress = p => document.getElementById('ocr-progress-made').innerHTML = !p ? '' : 'Progress: ' + p + '%';

// Get the modal
const ocrLoadingModal = document.getElementById("loading-modal");
const ocrConfigureModal = document.getElementById("ocr-configure-modal");

let quality = 1;
let webViewerDoc;
let loadDocumentIntoWebViewer;
let createDocumentFromBuffer;
let applyOCRJsonToPDF;
let selectedLanguage = 'eng';

// See https://tesseract-ocr.github.io/tessdoc/Data-Files#data-files-for-version-400-november-29-2016 for listed languages
const supportedLanguages = {
  afr: 'Afrikaans',
  amh: 'Amharic',
  ara: 'Arabic',
  asm: 'Assamese',
  aze: 'Azerbaijani',
  aze_cyrl: 'Azerbaijani - Cyrillic',
  bel: 'Belarusian',
  ben: 'Bengali',
  bod: 'Tibetan',
  bos: 'Bosnian',
  bul: 'Bulgarian',
  cat: 'Catalan',
  ceb: 'Cebuano',
  ces: 'Czech',
  chi_sim: 'Chinese - Simplified',
  chi_tra: 'Chinese - Traditional',
  chr: 'Cherokee',
  cym: 'Welsh',
  dan: 'Danish',
  deu: 'German',
  dzo: 'Dzongkha',
  ell: 'Greek - Modern',
  eng: 'English',
  enm: 'English - Middle',
  epo: 'Esperanto',
  est: 'Estonian',
  eus: 'Basque',
  fas: 'Persian',
  fin: 'Finnish',
  fra: 'French',
  frk: 'German Fraktur',
  frm: 'French - Middle',
  gle: 'Irish',
  glg: 'Galician',
  grc: 'Greek - Ancient',
  guj: 'Gujarati',
  hat: 'Haitian',
  heb: 'Hebrew',
  hin: 'Hindi',
  hrv: 'Croatian',
  hun: 'Hungarian',
  iku: 'Inuktitut',
  ind: 'Indonesian',
  isl: 'Icelandic',
  ita: 'Italian',
  ita_old: 'Italian - Old',
  jav: 'Javanese',
  jpn: 'Japanese',
  kan: 'Kannada',
  kat: 'Georgian',
  kat_old: 'Georgian - Old',
  kaz: 'Kazakh',
  khm: 'Central',
  kir: 'Kirghiz',
  kor: 'Korean',
  kur: 'Kurdish',
  lao: 'Lao',
  lat: 'Latin',
  lav: 'Latvian',
  lit: 'Lithuanian',
  mal: 'Malayalam',
  mar: 'Marathi',
  mkd: 'Macedonian',
  mlt: 'Maltese',
  msa: 'Malay',
  mya: 'Burmese',
  nep: 'Nepali',
  nld: 'Dutch',
  nor: 'Norwegian',
  ori: 'Oriya',
  pan: 'Panjabi',
  pol: 'Polish',
  por: 'Portuguese',
  pus: 'Pushto',
  ron: 'Romanian',
  rus: 'Russian',
  san: 'Sanskrit',
  sin: 'Sinhala',
  slk: 'Slovak',
  slv: 'Slovenian',
  spa: 'Spanish',
  spa_old: 'Spanish - Old',
  sqi: 'Albanian',
  srp: 'Serbian',
  srp_latn: 'Serbian - Latin',
  swa: 'Swahili',
  swe: 'Swedish',
  syr: 'Syriac',
  tam: 'Tamil',
  tel: 'Telugu',
  tgk: 'Tajik',
  tgl: 'Tagalog',
  tha: 'Thai',
  tir: 'Tigrinya',
  tur: 'Turkish',
  uig: 'Uighur',
  ukr: 'Ukrainian',
  urd: 'Urdu',
  uzb: 'Uzbek',
  uzb_cyrl: 'Uzbek',
  vie: 'Vietnamese',
  yid: 'Yiddish',
};

const dropdown = document.getElementById('languages');

Object.keys(supportedLanguages).sort((l1, l2) => supportedLanguages[l1] > supportedLanguages[l2] ? 1 : -1)
  .map(l => {
    const opt = document.createElement('option');
    opt.value = l;
    opt.innerText = supportedLanguages[l];
    dropdown.appendChild(opt);
  });

const runOCRButton = document.getElementById('ocr-button');

runOCRButton.addEventListener('click', _ => {
  setUpDocument(quality);
  ocrConfigureModal.style.display = "none";
});

dropdown.value = selectedLanguage;

const setLanguage = e => selectedLanguage = e.target.value;

document.getElementById('quality')
  .addEventListener('change', e => {
    quality = e.target.value;
  });

const convertTesserectOutputToPDFTronOCRJson = (tesseractOutput, divisor, pageNum, n) => {
  const osModifier = 1 + !!(window.navigator.appVersion.indexOf("Win") != -1);
  const extractWordData = word => {
    const x = Math.floor(word.baseline.x0 * divisor * osModifier);
    const y = Math.floor(word.baseline.y0 * divisor * osModifier);
    const length = Math.floor(word.baseline.x1 * divisor * osModifier) - x;
    const text = word['text'];
    const fontSize = word['font_size'] * osModifier;
    return {
      'font-size': fontSize,
      length,
      text,
      orientation: 'U',
      x,
      y
    }
  };

  const extractDataFromLine = line => {
    const lineBoxPositionX = line.bbox.x0 * divisor;
    const lineBoxPositionY = line.bbox.y0 * divisor;
    const lineBoxWidth = Math.floor((line.bbox.x1 - line.bbox.x0) * divisor);
    const lineBoxHeight = Math.floor((line.bbox.y1 - line.bbox.y0) * divisor);

    const Word = line.words.map(extractWordData);
    const box = [
      lineBoxPositionX,
      lineBoxPositionY,
      lineBoxWidth,
      lineBoxHeight,
    ];

    return {
      Word,
      box
    }
  };

  return {
    "Para":
      tesseractOutput.paragraphs.map(p => ({
        "Line":
          p.lines.map(extractDataFromLine)
      }))
    ,
    "dpi": (n * 96),
    "num": pageNum,
    "origin": "TopLeft"
  };
}

const loadDocument = fileInput => loadDocumentIntoWebViewer(!!fileInput.files ? fileInput.files[0] : fileInput);

const setUpDocument = async n => {

  let pn;

  document.getElementById('page-marker').innerHTML = 'Preparing Document for OCR';
  updateProgress(0);
  ocrLoadingModal.style.display = "block";

  const worker = Tesseract.createWorker({
    logger: m => {
      if (m.status === "recognizing text" && !!m.progress && m.progress !== 1) {
        updatePage(pn);
        updateProgress(Math.round(100 * m.progress), pn);
      }
      console.log(m)
    },
  });

  const work = async (image, pageNum) => {
    await worker.load();
    await worker.loadLanguage(selectedLanguage);
    await worker.initialize(selectedLanguage);
    worker.setParameters({ 'user_defined_dpi': (n * 96).toString() });

    let divisor = 1 / n;

    let result = await worker.recognize(image);
    console.log(result.data);


    return convertTesserectOutputToPDFTronOCRJson(result.data, divisor, pageNum, n);
  }

  Tesseract.setLogging(true);
  const pages = [];
  for (let i = 1; i <= webViewerDoc.getPageCount(); ++i) {
    pn = i;
    const drawCompeletionPromise = new Promise((res, rej) => {
      webViewerDoc.loadCanvasAsync(({
        pageNumber: i,
        zoom: n / 2,
        drawComplete: async (thumbnail) => {
          const json = await work(thumbnail.toDataURL(), i);
          pages[i - 1] = json;
          res();
        }
      }));
    });

    await drawCompeletionPromise;
  }

  updatePage();
  updateProgress();

  await worker.terminate();
  await runOCR({
    "Page": pages,
  });
}

const runOCR = async ocrJson => {

  const data = await webViewerDoc.getFileData();
  const doc = await createDocumentFromBuffer(new Uint8Array(data));

  try {
    console.log(ocrJson)

    await applyOCRJsonToPDF(doc, JSON.stringify(ocrJson))
      .then(_ => console.log('SUCCESS'))
      .catch(e => {
        console.log('EXCEPTION:');
        console.log(e);
      });
  } catch (err) {
    console.log(err);
  } finally {
    ocrLoadingModal.style.display = 'none';
    loadDocument(doc);
  }
}

WebViewer({
  path: './webviewer/lib',
  //initialDoc: './larynx_diagram.pdf',
  fullAPI: true,
}, document.getElementById('viewer'))
  .then(async instance => {
    const { PDFNet, docViewer } = instance;

    loadDocumentIntoWebViewer = instance.loadDocument;
    applyOCRJsonToPDF = PDFNet.OCRModule.applyOCRJsonToPDF;
    createDocumentFromBuffer = PDFNet.PDFDoc.createFromBuffer;

    await PDFNet.initialize();

    instance.docViewer.on('documentLoaded', _ => webViewerDoc = docViewer.getDocument());

    const uploadButton = {
      type: 'actionButton',
      title: 'Open File',
      img: '<svg xmlns="http://www.w3.org/2000/svg" data-name="Layer 1" viewBox="0 0 24 24"><defs><style>.cls-1{fill:#868e96;}</style></defs><path class="cls-1" d="M3.16,19.22a.93.93,0,0,0,.79.43H18.17a1,1,0,0,0,.88-.57l2.84-6.64A1,1,0,0,0,21,11.11h-.95V7.32a1.9,1.9,0,0,0-1.9-1.9H12.39L10.22,3.73a.93.93,0,0,0-.58-.2H4.9A1.9,1.9,0,0,0,3,5.42V18.7H3A.88.88,0,0,0,3.16,19.22Zm14.39-1.47H5.39l2-4.74H19.58Zm.62-10.43v3.79H6.79a1,1,0,0,0-.87.58l-1,2.39V7.32H18.17Z"/></svg>',
      onClick: _ => {
        document.getElementById('file-input').click();
      },
    }

    const newActionButton = {
      type: 'actionButton',
      title: 'Apply OCR',
      img: '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" style="fill:rgba(0, 0, 0, 1);transform:;-ms-filter:"><path d="M19.864,8.465C19.953,8.152,20,7.827,20,7.5c0-1.817-1.392-3.315-3.166-3.484C16.426,2.844,15.31,2,14,2 c-0.771,0-1.468,0.301-2,0.78C11.468,2.301,10.771,2,10,2C8.699,2,7.59,2.831,7.175,4.015C5.396,4.18,4,5.68,4,7.5 c0,0.327,0.047,0.652,0.136,0.965C2.861,9.143,2,10.495,2,12c0,1.075,0.428,2.086,1.172,2.832C3.059,15.208,3,15.603,3,16 c0,1.957,1.412,3.59,3.306,3.934C6.86,21.165,8.104,22,9.5,22c0.979,0,1.864-0.407,2.5-1.059C12.636,21.593,13.521,22,14.5,22 c1.394,0,2.635-0.831,3.19-2.06C19.568,19.612,21,17.97,21,16c0-0.397-0.059-0.792-0.172-1.168C21.572,14.086,22,13.075,22,12 C22,10.495,21.139,9.143,19.864,8.465z M9.5,20c-0.711,0-1.33-0.504-1.47-1.198L7.818,18H7c-1.103,0-2-0.897-2-2 c0-0.352,0.085-0.682,0.253-0.981l0.456-0.816l-0.784-0.51C4.346,13.315,4,12.683,4,12c0-0.977,0.723-1.824,1.682-1.972l1.693-0.26 L6.316,8.422C6.112,8.162,6,7.835,6,7.5C6,6.673,6.673,6,7.5,6c0.106,0,0.214,0.014,0.314,0.032L9,6.207V5c0-0.552,0.448-1,1-1 s1,0.448,1,1v13.5C11,19.327,10.327,20,9.5,20z M19.075,13.692l-0.784,0.51l0.456,0.816C18.915,15.318,19,15.648,19,16 c0,1.103-0.897,2-2.05,2h-0.818l-0.162,0.802C15.83,19.496,15.211,20,14.5,20c-0.827,0-1.5-0.673-1.5-1.5V5c0-0.552,0.448-1,1-1 s1,0.448,1,1.05v1.207l1.186-0.225C16.286,6.014,16.394,6,16.5,6C17.327,6,18,6.673,18,7.5c0,0.335-0.112,0.662-0.316,0.922 l-1.059,1.347l1.693,0.26C19.277,10.176,20,11.023,20,12C20,12.683,19.654,13.315,19.075,13.692z"></path></svg>',
      onClick: () => {
        ocrConfigureModal.style.display = 'block';
      },
      dataElement: 'contextSearch',
    }

    instance.setHeaderItems(header => {
      header.push(uploadButton)
      header.push(newActionButton)
      return header;
    });
  });
