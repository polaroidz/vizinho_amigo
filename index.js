const { GoogleSpreadsheet } = require('google-spreadsheet');
const Tabulator = require('tabulator-tables');

const API_KEY = "AIzaSyDcS9joXlxPwihF48NHjxF36gkqG30Vt5M";
const SPREADSHEET_ID = "1kLg3peWbcvJjdKmI1vfzQ_JlFJS1nqclfQBO8nCKBOo";

const QUERO_AJUDAR = "Quero ajudar";
const PRECISO_DE_AJUDA = "Preciso de Ajuda";
const EMBAIXADOR = "Embaixador";

const GEOCODER_BATCH_SIZE = 10;
const GEOCODER_RATE_LIMIT = 10; // 0.1s

const MAX_ITEMS_ON_MAP = 200;

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

let gQueroAjudarData = [];
let gPrecisoAjudaData = [];

let gQueroAjudarTable = null;
let gPrecisoAjudaTable = null;

const gQueroAjudarTotal = document.getElementById("queroAjudarTotal");
const gPrecisoAjudaTotal = document.getElementById("precisoAjudaTotal");

const gQueroAjudarCount = document.getElementById("queroAjudarCount");
const gPrecisoAjudaCount = document.getElementById("precisoAjudaCount");

const gAtualizarMapaBtn = document.getElementById("atualizarMapa");
const gOcultarResolvidosBtn = document.getElementById("ocultarResolvidos");
const gLimparFiltrosBtn = document.getElementById("limparFiltros");

const gRaioDeBusca = document.getElementById("raioDeBusca");
const gRadiusCircle = new google.maps.Circle({
    fillOpacity: 0,
    strokeColor: '#000000',
    strokeOpacity: 1,
    strokeWeight: 3,
    center: location,
    map: null,
    zIndex: 0,
    radius: gRaioDeBusca.value * 1000
});

let gLocationRequestCount = 0;
let gLocationRequestTotal = 0;

/*================================================================*/

const geocoder = new google.maps.Geocoder();

function requestGeocoderAddress(address, cb) {    
    if (gHasMapUpdated) {
        return;
    }
    
    geocoder.geocode({ address }, function(results, status) {
        if (status === 'OK') {
            const { location } = results[0].geometry;

            gLocationRequestCount += 1;

            if (gLocationRequestCount >= gLocationRequestTotal) {
                gAtualizarMapaBtn.disabled = false;
                gAtualizarMapaBtn.innerText = "Atualizar Mapa";
            } else {
                const text = gLocationRequestCount + "/" + gLocationRequestTotal;
                gAtualizarMapaBtn.innerText = "Atualizando mapa (" + text + ")...";
            }

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

function toRadians(degrees) {
    return degrees * (Math.PI / 180);
}

const R = 6371e3;
function calcDistance(lat1, lon1, lat2, lon2) {
    const φ1 = toRadians(lat1);
    const φ2 = toRadians(lat2);
    const Δφ = toRadians(lat2 - lat1);
    const Δλ = toRadians(lon2 - lon1);
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    const d = R * c;

    return d / 1000;
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

    let id = 0;
    for (let i = 0; i < rows.length; i += 1) {
        rows[i]["_id"] = id++;
    }

    return rows;
}

let hasPopulatedPrecisoAjudaTable = false;
async function populatePrecisoAjudaTable(data) {
    gPrecisoAjudaTable = new Tabulator("#precisoAjuda", {
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
    gQueroAjudarTable = new Tabulator("#queroAjudar", {
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

            const slice = rows.slice(0, MAX_ITEMS_ON_MAP);
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
    const info = voluntario["Compartilhe conosco informações importantes (opcional):"];

    return "Nome: " + nome  
        +  "\nTelefone: " + telefone 
        + "\nEmail: " + email
        +  "\nBairro: " + bairro
        + "\nInformações: " + info;
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
                zIndex: 1,
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
                zIndex: 1,
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

            gLocationRequestTotal += 1;

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
    const porque = voluntario["Por que eu preciso de ajuda?"];
    const praque = voluntario["Você precisa de ajuda para quê?"];
    const detalhe = voluntario["Descreva detalhadamente o seu pedido:"];

    const message = "Clique em OK para mostrar o raio especificado";

    return "Nome: " + nome  
        +  "\nTelefone: " + telefone 
        + "\nEmail: " + email
        +  "\nBairro: " + bairro
        + "\nPor que?: " + porque
        + "\nPra que?: " + praque
        + "\nDetalhamento: " + detalhe
        + "\n\n" + message;
}

function handlePrecisoAjudaSelecinado(precisoAjuda) {
    const data = [precisoAjuda];

    gPrecisoAjudaTable.replaceData(data);
    clearPrecisoAjudaCircles();
    showPrecisoAjudaCircles(data);
    
    const circle1 = gPrecisoAjudaCircles[precisoAjuda["_id"]];
    const center1 = circle1.getCenter();

    gRadiusCircle.setCenter(center1);
    gRadiusCircle.setRadius(gRaioDeBusca.value * 1000);
    gRadiusCircle.setMap(gMap);

    const lat1 = center1.lat();
    const lng1 = center1.lng();

    let voluntarios = [];

    for (const _id in gVoluntariosCircles) {
        const circle2 = gVoluntariosCircles[_id];
        const center2 = circle2.getCenter();
        
        const lat2 = center2.lat();
        const lng2 = center2.lng();

        const distance = calcDistance(lat1, lng1, lat2, lng2);

        if (distance <= gRaioDeBusca.value) {
            for(const voluntario of gVoluntariosMapData) {
                if (voluntario["_id"] == _id) {
                    voluntarios.push(voluntario)
                    break;
                }
            }
        }
    }

    gQueroAjudarTable.replaceData(voluntarios);
    clearVoluntariosCircles();
    showVoluntariosCircles(voluntarios);

    gLimparFiltrosBtn.disabled = false;
}

function handleLimparFiltrosClick() {
    gLimparFiltrosBtn.disabled = true;

    gQueroAjudarTable.replaceData(gQueroAjudarData);
    gPrecisoAjudaTable.replaceData(gPrecisoAjudaData);

    gRadiusCircle.setMap(null);

    clearVoluntariosCircles();
    clearPrecisoAjudaCircles();

    showVoluntariosCircles(gVoluntariosMapData);
    showPrecisoAjudaCircles(gPrecisoAjudaMapData);
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
            zIndex: 1,
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

            gLocationRequestTotal += 1;

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

    gRadiusCircle.setMap(null);

    gLocationRequestCount = 0;
    gLocationRequestTotal = 0;

    showVoluntariosCircles(gVoluntariosMapData);
    showPrecisoAjudaCircles(gPrecisoAjudaMapData);
    
    gOcultarResolvidos = false;
    gAtualizarMapaBtn.disabled = true;
    gAtualizarMapaBtn.innerText = "Atualizando mapa...";    
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

    gQueroAjudarData = await getDataFromSheet(queroAjudarSheet);
    gPrecisoAjudaData = await getDataFromSheet(precisoAjudaSheet);

    gQueroAjudarTotal.innerText = gQueroAjudarData.length;
    gPrecisoAjudaTotal.innerText = gPrecisoAjudaData.length;

    await populateQueroAjudarTable(gQueroAjudarData);
    await populatePrecisoAjudaTable(gPrecisoAjudaData);

    gAtualizarMapaBtn.addEventListener('click', handleAtualizarMapaClick);
    gOcultarResolvidosBtn.addEventListener('click', handleOcultarResolvidosClick);

    gLimparFiltrosBtn.addEventListener('click', handleLimparFiltrosClick);
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