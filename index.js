const { GoogleSpreadsheet } = require('google-spreadsheet');
var Tabulator = require('tabulator-tables');

const API_KEY = "AIzaSyDcS9joXlxPwihF48NHjxF36gkqG30Vt5M";
const SPREADSHEET_ID = "1kLg3peWbcvJjdKmI1vfzQ_JlFJS1nqclfQBO8nCKBOo";

const QUERO_AJUDAR = "Quero ajudar";
const PRECISO_DE_AJUDA = "Preciso de Ajuda";
const EMBAIXADOR = "Embaixador";

const GEOCODER_BATCH_SIZE = 10;
const GEOCODER_RATE_LIMIT = 10; // 0.1s

const ESTADOS = {
    "AC": "Acre",
    "AL": "Alagoas",
    "AP": "Amapá",
    "AM": "Amazonas",
    "BA": "Bahia",
    "CE": "Ceará",
    "DF": "Distrito Federal",
    "ES": "Espírito Santo",
    "GO": "Goiás",
    "MA": "Maranhão",
    "MT": "Mato Grosso",
    "MS": "Mato Grosso do Sul",
    "MG": "Minas Gerais",
    "PA": "Pará",
    "PB": "Paraíba",
    "PR": "Paraná",
    "PE": "Pernambuco",
    "PI": "Piauí",
    "RJ": "Rio de Janeiro",
    "RN": "Rio Grande do Norte",
    "RS": "Rio Grande do Sul",
    "RO": "Rondônia",
    "RR": "Roraima",
    "SC": "Santa Catarina",
    "SP": "São Paulo",
    "SE": "Sergipe",
    "TO": "Tocantins"
};

let gMap = undefined;

let gVoluntariosCircles = {};
let gPrecisoAjudaCircles = {};

let gHasMapUpdated = false;
let gZoomLevel = 6;

let gOcultarResolvidos = false;

let gVoluntariosMapData = [];
let gPrecisoAjudaMapData = [];

let gQueroAjudarTotal = document.getElementById("queroAjudarTotal");
let gPrecisoAjudaTotal = document.getElementById("precisoAjudaTotal");

let gQueroAjudarCount = document.getElementById("queroAjudarCount");
let gPrecisoAjudaCount = document.getElementById("precisoAjudaCount");

/*================================================================*/

const geocoder = new google.maps.Geocoder();

function requestGeocoderAddress(address, cb) {    
    if (gHasMapUpdated) {
        return;
    }
    
    geocoder.geocode({ address }, function(results, status) {
        if (status === 'OK') {
            const { location } = results[0].geometry;
            cb(location);
        } else {
            setTimeout(() => requestGeocoderAddress(address, cb), GEOCODER_RATE_LIMIT);
        }
    });
}

function callGeocoderAPI(address, count, cb) {
    if (count % GEOCODER_BATCH_SIZE == 0) {
        const batch_number = count / GEOCODER_BATCH_SIZE;
        const timeout = batch_number * GEOCODER_RATE_LIMIT;

        setTimeout(() => requestGeocoderAddress(address, cb), timeout);
    } else {
        requestGeocoderAddress(address, cb);
    }
}


/*================================================================*/

function notifyUser(message) {
    console.log(message);
}

function getWorksheet(doc, title) {
    const count = doc.sheetCount;

    for (let i = 0; i < count; i += 1) {
        const sheet = doc.sheetsByIndex[i];
        console.log(sheet.title);

        if (sheet.title == title) {
            return sheet;
        }
    }

    notifyUser("Não foi possivel carregar a planilha: " + title);
}

async function getDataFromSheet(sheet) {
    let data = [];

    const rows = await sheet.getRows();

    console.log(Object.getOwnPropertyNames(rows[0]))

    let id = 1;
    for (let i = 0; i < rows.length; i += 1) {
        rows[i]["_id"] = id++;
    }

    return rows;
}

let hasPopulatedPrecisoAjudaTable = false;
async function populatePrecisoAjudaTable(data) {
    const tabulator = new Tabulator("#precisoAjuda", {
        data,
        layout:"fitDataFill",
        movableColumns:true,
        height:305 - 30,
        columns: [
            {
                title:"Situação do Match", 
                field:"Situação do Match",
                headerFilter:"input"
            },
            {
                title:"Nome Completo", 
                field:"Nome Completo:", 
                headerFilter:"input"
            },
            {
                title:"Telefone", 
                field:"Telefone para contato (Com Whatsapp, de preferência):",
                headerFilter:"input"
            },
            {
                title:"Estado", 
                field:"Estado/UF (Sigla):",
                headerFilter:"input"
            },
            {
                title:"Cidade", 
                field:"Cidade:",
                headerFilter:"input"
            },
            {
                title:"Bairro", 
                field:"Bairro:",
                headerFilter:"input"
            },
            {
                title:"Zona", 
                field:"Zona que você mora na cidade:",
                headerFilter:"input"
            },
            {
                title:"Email", 
                field:"E-mail para contato:",
                headerFilter:"input"
            },
            {
                title:"Endereço", 
                field:"Nos informe o seu endereço (Rua e número):",
                headerFilter:"input"
            },
            {
                title:"Por que eu preciso de ajuda?", 
                field:"Por que eu preciso de ajuda?", 
                headerFilter:"input"
            },
            {
                title:"Você precisa de ajuda para quê?", 
                field:"Você precisa de ajuda para quê?", 
                headerFilter:"input"
            },
            {
                title:"Descreva detalhadamente o seu pedido", 
                field:"Descreva detalhadamente o seu pedido:", 
                headerFilter:"input"
            }
        ],
        dataFiltered:function(filters, rows){
            gPrecisoAjudaCount.innerText = rows.length;

            const data = rows.map(row => row.getData());
            gPrecisoAjudaMapData = data;
        }
    });
}

async function populateQueroAjudarTable(data) {
    const tabulator = new Tabulator("#queroAjudar", {
        data,
        layout:"fitDataFill",
        movableColumns:true,
        height:305 - 30,
        columns: [
            {
                title:"Nome Completo", 
                field:"Nome completo:", 
                headerFilter:"input"
            },
            {
                title:"Quero ser", 
                field:"Quero ser:", 
                headerFilter:"input"
            },
            {
                title:"Telefone", 
                field:"Telefone para contato:",
                headerFilter:"input"
            },
            {
                title:"Estado", 
                field:"Estado/UF (Sigla):",
                headerFilter:"input"
            },
            {
                title:"Cidade", 
                field:"Cidade:",
                headerFilter:"input"
            },
            {
                title:"Bairro", 
                field:"Bairro:",
                headerFilter:"input"
            },
            {
                title:"Zona", 
                field:"Zona que você mora na cidade:",
                headerFilter:"input"
            },
            {
                title:"Email", 
                field:"E-mail para contato:",
                headerFilter:"input"
            },
            {
                title:"Endereço", 
                field:"Nos informe o seu endereço (Rua e número):",
                headerFilter:"input"
            },
            {
                title:"Informações Importantes", 
                field:"Compartilhe conosco informações importantes (opcional):",
                headerFilter:"input"
            }
        ],
        dataFiltered:function(filters, rows){
            gQueroAjudarCount.innerText = rows.length;

            const slice = rows.slice(0, 100);
            const data = slice.map(row => row.getData());

            //showVoluntariosCircles(data);
            gVoluntariosMapData = data;
        }
    });
}

/*
Voluntário
*/
function getVoluntarioCircleTitle(voluntario) {
    const nome = voluntario["Nome completo:"];
    const telefone = voluntario["Telefone para contato:"];
    const email = voluntario["E-mail para contato:"];
    const bairro = voluntario["Bairro:"];

    return "Nome: " + nome  
        +  "\nTelefone: " + telefone 
        + "\nEmail: " + email
        +  "\nBairro: " + bairro;
}

function addVoluntarioCircleFromAddress(voluntario, count, address) {
    callGeocoderAPI(address, count, (location) => {
        let circle = null;
        const title = getVoluntarioCircleTitle(voluntario);

        if (voluntario["Quero ser:"] === "Vizinho Amigo") {
            circle = new google.maps.Circle({
                strokeColor: '#0000FF',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: '#0000FF',
                fillOpacity: 0.35,
                center: location,
                animation: google.maps.Animation.DROP,
                map: gMap,
                title,
                radius: calcCircleRadius()
            });
        } else {
            circle = new google.maps.Circle({
                strokeColor: '#00FF00',
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: '#00FF00',
                fillOpacity: 0.35,
                center: location,
                animation: google.maps.Animation.DROP,
                map: gMap,
                title,
                radius: calcCircleRadius()
            });
        }

        circle.addListener('click', function() {
            alert(title);
        });

        gVoluntariosCircles[voluntario["_id"]] = circle;
    });
}

function clearVoluntariosCircles() {
    for (const _id in gVoluntariosCircles) {
        gVoluntariosCircles[_id].setMap(null);
    }
}

function showVoluntariosCircles(voluntarios) {
    let count = 0;
    for (const voluntario of voluntarios) {
        if (voluntario["_id"] in gVoluntariosCircles) {
            gVoluntariosCircles[voluntario["_id"]].setMap(gMap);
        } else {
            const address = resolveAddressQueroAjudar(voluntario);
            addVoluntarioCircleFromAddress(voluntario, count++, address);
        }
    }
}

/*
Preciso de Ajuda
*/
function getPrecisoAjudaCircleTitle(voluntario) {
    const nome = voluntario["Nome Completo:"];
    const telefone = voluntario["Telefone para contato (Com Whatsapp, de preferência):"];
    const email = voluntario["E-mail para contato:"];
    const bairro = voluntario["Bairro:"];

    const message = "Clique em OK para buscar voluntários dentro do raio especificado";

    return "Nome: " + nome  
        +  "\nTelefone: " + telefone 
        + "\nEmail: " + email
        +  "\nBairro: " + bairro
        + "\n\n" + message;
}

function handlePrecisoAjudaSelecinado(precisoAjuda) {
    console.log(precisoAjuda);
}

function addPrecisoAjudaCircleFromAddress(precisoAjuda, count, address) {
    callGeocoderAPI(address, count, (location) => {
        let circle = null;
        const title = getPrecisoAjudaCircleTitle(precisoAjuda);

        circle = new google.maps.Circle({
            strokeColor: '#FF0000',
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: '#FF0000',
            fillOpacity: 0.35,
            center: location,
            map: gMap,
            title,
            radius: calcCircleRadius()
        });            

        circle.addListener('click', function() {
            const selecionado = confirm(title);

            if (selecionado) {
                handlePrecisoAjudaSelecinado(precisoAjuda);
            }
        });

        gPrecisoAjudaCircles[precisoAjuda["_id"]] = circle;        
    });
}

function clearPrecisoAjudaCircles() {
    for (const _id in gPrecisoAjudaCircles) {
        gPrecisoAjudaCircles[_id].setMap(null);
    }
}

function showPrecisoAjudaCircles(precisoAjudas) {
    let count = 0;
    for (const precisoAjuda of precisoAjudas) {
        if (precisoAjuda["_id"] in gPrecisoAjudaCircles) {
            gPrecisoAjudaCircles[precisoAjuda["_id"]].setMap(gMap);
        } else {
            const address = resolveAddressPrecisoAjuda(precisoAjuda);
            addPrecisoAjudaCircleFromAddress(precisoAjuda, count++, address);
        }
    }
}


/*
Av. Paulista, 1098, 1º andar, apto. 101
Bela Vista
São Paulo - SP
Brasil
01310-000
*/

function resolveAddressQueroAjudar(voluntario) {
    const endereco = voluntario["Nos informe o seu endereço (Rua e número):"];
    const bairro = voluntario["Bairro:"];
    const sigla = voluntario["Estado/UF (Sigla):"];
    const pais = "Brasil";
    const cep = voluntario["CEP"];

    let resolved = "";

    if (endereco && endereco.length > 2) {
        resolved += endereco;
    }

    if (bairro && bairro.length > 2) {
        resolved += ", " + bairro;
    }

    if (sigla && sigla.length == 2 && sigla in ESTADOS) {
        resolved += ", " + ESTADOS[sigla.toUpperCase()] + " - " + sigla;
    }

    if (resolved.length == 0 && !cep) {
        return false;
    }

    resolved += ", " + pais;
    
    if (cep && cep.length > 2) {
        resolved += ", " + cep;
    }

    return resolved;
}

function resolveAddressPrecisoAjuda(voluntario) {
    const endereco = voluntario["Nos informe o seu endereço (Rua e número):"];
    const bairro = voluntario["Bairro:"];
    const sigla = voluntario["Estado/UF (Sigla):"];
    const pais = "Brasil";
    const cep = voluntario["CEP"];

    let resolved = "";

    if (endereco && endereco.length > 2) {
        resolved += endereco;
    }

    if (bairro && bairro.length > 2) {
        resolved += ", " + bairro;
    }

    if (sigla && sigla.length == 2 && sigla in ESTADOS) {
        resolved += ", " + ESTADOS[sigla.toUpperCase()] + " - " + sigla;
    }

    if (resolved.length == 0 && !cep) {
        return false;
    }

    resolved += ", " + pais;
    
    if (cep && cep.length > 2) {
        resolved += ", " + cep;
    }

    return resolved;
}

function handleAtualizarMapaClick() {
    clearVoluntariosCircles();
    clearPrecisoAjudaCircles();

    showVoluntariosCircles(gVoluntariosMapData);
    showPrecisoAjudaCircles(gPrecisoAjudaMapData);

    gOcultarResolvidos = true;
}

function ocultarResolvidos() {
    clearPrecisoAjudaCircles();
    
    let data = [];
    for (const precisoAjuda of gPrecisoAjudaMapData) {
        const situacao = precisoAjuda["Situação do Match"];

        if (situacao != "Resolvido") {
            data.push(precisoAjuda);
        }
    }

    showPrecisoAjudaCircles(data);
}

function showAllPrecisoAjuda() {
    clearPrecisoAjudaCircles();

    showPrecisoAjudaCircles(gPrecisoAjudaMapData);
} 

function handleOcultarResolvidosClick() {
    gOcultarResolvidos = !gOcultarResolvidos;

    if(gOcultarResolvidos) {
        this.innerText = "Mostrar Todos";
        ocultarResolvidos();
    } else {
        this.innerText = "Ocultar Resolvidos";
        showAllPrecisoAjuda();
    }
}

async function start() {
    const doc = new GoogleSpreadsheet(SPREADSHEET_ID);
 
    doc.useApiKey(API_KEY);

    await doc.loadInfo();
    console.log(doc.title);

    const queroAjudarSheet = getWorksheet(doc, QUERO_AJUDAR);
    const precisoAjudaSheet = getWorksheet(doc, PRECISO_DE_AJUDA);
    //const embaixadorSheet = getWorksheet(doc, EMBAIXADOR);

    const queroAjudar = await getDataFromSheet(queroAjudarSheet);
    const precisoAjuda = await getDataFromSheet(precisoAjudaSheet);

    gQueroAjudarTotal.innerText = queroAjudar.length;
    gPrecisoAjudaTotal.innerText = precisoAjuda.length;

    await populateQueroAjudarTable(queroAjudar);
    await populatePrecisoAjudaTable(precisoAjuda);

    const atualizarMapaBtn = document.getElementById("atualizarMapa");
    const ocultarResolvidosBtn = document.getElementById("ocultarResolvidos");

    atualizarMapaBtn.addEventListener('click', handleAtualizarMapaClick);
    ocultarResolvidosBtn.addEventListener('click', handleOcultarResolvidosClick);
}

function calcCircleRadius() {
    if (gZoomLevel <= 7) return 10000
    else if (gZoomLevel <= 8) return 5000
    else if (gZoomLevel <= 9) return 3000
    else if (gZoomLevel <= 10) return 1000
    else if (gZoomLevel <= 15) return 250
    else if (gZoomLevel <= 16) return 100
    else return 50;
}

function applyZoomLevel(zoomLevel) {
    gZoomLevel = zoomLevel;
    const radius = calcCircleRadius();

    for (const _id in gVoluntariosCircles) {
        const marker = gVoluntariosCircles[_id];
        marker.setRadius(radius);     
    }

    for (const _id in gPrecisoAjudaCircles) {
        const marker = gPrecisoAjudaCircles[_id];
        marker.setRadius(radius);
    }
}

async function startMap() {
    const el = document.getElementById('mapa');

    gMap = new google.maps.Map(el, {
        center: {lat: -22.0597007, lng: -44.0444694},
        zoom: 5,
        mapTypeControl: false
    });

    google.maps.event.addListener(gMap, 'zoom_changed', function() {
        const zoomLevel = gMap.getZoom();

        applyZoomLevel(zoomLevel);
    });
}

(async() => {
    console.log('before start');

    await startMap();
    await start();
    
    console.log('after start');
})();