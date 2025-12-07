// Variáveis globais
let map;
let userMarker;
let userPosition;
let placesService;
let directionsService;
let directionsRenderer;
let markers = [];
let currentInfoWindow = null;
let navigationActive = false;
let navigationWatchId = null;
let currentRoute = null;
let currentDestination = null;
let currentDestinationName = null;
let routeSteps = [];
let currentStepIndex = 0;
let routeDeviationCheckInterval = null;
let speechSynthesisSupported = 'speechSynthesis' in window;
let selectedRouteIndex = 0;
let placeMarkers = {};
let currentAnchorMarker = null;
let currentRoutesInfoWindow = null;

// TRAI: Inserir Google API Key aqui para todas as chamadas à API

// Inicializar o mapa quando a página carregar
document.addEventListener('DOMContentLoaded', () => {
    // Configurar o botão de obter localização
    document.getElementById('get-location').addEventListener('click', getUserLocation);
    
    // Configurar os botões de filtro
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(button => {
        // Desabilitar botões inicialmente até que a localização seja obtida
        button.disabled = true;
        
        button.addEventListener('click', () => {
            // Remover classe ativa de todos os botões
            filterButtons.forEach(btn => btn.classList.remove('active'));
            
            // Adicionar classe ativa ao botão clicado
            button.classList.add('active');
            
            // Buscar locais próximos com base no tipo selecionado
            if (userPosition) {
                const placeType = button.getAttribute('data-type');
                searchNearbyPlaces(placeType);
            } else {
                updateLocationStatus('Por favor, compartilhe sua localização primeiro.');
            }
        });
    });
    
    // Inicializar o mapa com uma localização padrão (Brasil)
    initMap({ lat: -15.77972, lng: -47.92972 });
    
    // Verificar se já temos permissão de geolocalização e obter automaticamente
    if (navigator.permissions) {
        navigator.permissions.query({name:'geolocation'}).then(function(result) {
            if (result.state === 'granted') {
                // Se já temos permissão, obter localização automaticamente
                getUserLocation();
            }
        });
    }
    
    // Funcionalidade do botão de emergência
    const emergencyButton = document.getElementById('emergencyButton');
    const emergencyPopup = document.getElementById('emergencyPopup');
    const closePopup = document.getElementById('closePopup');
    
    if (emergencyButton && emergencyPopup && closePopup) {
        // Garantir que o popup esteja inicialmente oculto
        emergencyPopup.style.display = 'none';
        
        emergencyButton.addEventListener('click', function(e) {
            e.stopPropagation(); // Impedir propagação do evento
            emergencyPopup.style.display = emergencyPopup.style.display === 'block' ? 'none' : 'block';
        });
        
        closePopup.addEventListener('click', function() {
            emergencyPopup.style.display = 'none';
        });
        
        // Adicionar eventos aos links de telefone
        const emergencyCalls = document.querySelectorAll('.emergency-call');
        emergencyCalls.forEach(call => {
            call.addEventListener('click', function(e) {
                // Permitir que o navegador abra o discador telefônico
                console.log('Ligando para: ' + this.getAttribute('href').replace('tel:', ''));
            });
        });
        
        // Fechar o popup se clicar fora dele, mas não se clicar em um link
        document.addEventListener('click', function(event) {
            if (!emergencyPopup.contains(event.target) && event.target !== emergencyButton) {
                emergencyPopup.style.display = 'none';
            }
        });
    }
    // Acessibilidade: toolbar
    const toggleFont = document.getElementById('toggle-font');
    const toggleContrast = document.getElementById('toggle-contrast');
    const toggleTts = document.getElementById('toggle-tts');
    let ttsEnabled = false;
    if (toggleFont) {
        toggleFont.addEventListener('click', () => {
            document.body.classList.toggle('font-large');
        });
    }
    if (toggleContrast) {
        toggleContrast.addEventListener('click', () => {
            document.body.classList.toggle('high-contrast');
        });
    }
    if (toggleTts) {
        toggleTts.addEventListener('click', () => {
            ttsEnabled = !ttsEnabled;
            showStatusMessage(ttsEnabled ? 'Leitura de tela ativada' : 'Leitura de tela desativada', 'info');
        });
        document.addEventListener('click', (e) => {
            if (!ttsEnabled) return;
            const target = e.target;
            const text = (target.innerText || target.textContent || '').trim();
            if (text && speechSynthesisSupported) {
                speakInstruction(text);
            }
        });
    }
});

// Inicializar o mapa do Google Maps
function initMap(center) {
    try {
        map = new google.maps.Map(document.getElementById('map'), {
            center: center,
            zoom: 14
        });
        
        // Inicializar o serviço de Places
        placesService = new google.maps.places.PlacesService(map);
        
        // Inicializar serviços de direções
        directionsService = new google.maps.DirectionsService();
        directionsRenderer = new google.maps.DirectionsRenderer({
            map: map,
            suppressMarkers: false,
            polylineOptions: {
                strokeColor: '#4285F4',
                strokeWeight: 5
            }
        });
        
        // Adicionar listener para erros da API
        window.gm_authFailure = function() {
            alert('Erro na autenticação da API do Google Maps. Verifique sua chave de API.');
            document.getElementById('map').innerHTML = '<div style="text-align:center; padding:20px; color:red;">Erro na API do Google Maps. Verifique sua chave de API.</div>';
        };
    } catch (error) {
        console.error('Erro ao inicializar o mapa:', error);
        document.getElementById('map').innerHTML = '<div style="text-align:center; padding:20px; color:red;">Erro ao carregar o mapa. Tente novamente mais tarde.</div>';
    }
}

// Obter a localização do usuário
function getUserLocation() {
    updateLocationStatus('Obtendo sua localização...');
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userPosition = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                
                // Centralizar o mapa na posição do usuário
                map.setCenter(userPosition);
                map.setZoom(15);
                
                // Adicionar marcador para a posição do usuário
                if (userMarker) {
                    userMarker.setPosition(userPosition);
                } else {
                    userMarker = new google.maps.Marker({
                        position: userPosition,
                        map: map,
                        title: 'Sua localização',
                        icon: {
                            url: 'http://maps.google.com/mapfiles/ms/icons/blue-dot.png'
                        }
                    });
                }
                
                updateLocationStatus('Localização obtida com sucesso! Agora selecione uma categoria para buscar locais próximos.');
                
                // Ativar os botões de filtro
                document.querySelectorAll('.filter-btn').forEach(btn => {
                    btn.disabled = false;
                });
            },
            (error) => {
                let errorMessage;
                switch (error.code) {
                    case error.PERMISSION_DENIED:
                        errorMessage = 'Acesso à localização negado pelo usuário.';
                        break;
                    case error.POSITION_UNAVAILABLE:
                        errorMessage = 'Informações de localização indisponíveis.';
                        break;
                    case error.TIMEOUT:
                        errorMessage = 'Tempo esgotado ao obter localização.';
                        break;
                    default:
                        errorMessage = 'Erro desconhecido ao obter localização.';
                }
                updateLocationStatus(errorMessage);
            }
        );
    } else {
        updateLocationStatus('Geolocalização não é suportada pelo seu navegador.');
    }
}

// Atualizar o status da localização
function updateLocationStatus(message) {
    document.getElementById('location-status').textContent = message;
}

// Buscar locais próximos com base no tipo
function searchNearbyPlaces(type) {
    // Limpar marcadores anteriores
    clearMarkers();
    
    // Limpar lista de resultados
    const placesList = document.getElementById('places-results');
    placesList.innerHTML = '';
    
    // Mapear os tipos de locais para os tipos corretos da API do Google
     const typeMapping = {
         'hospital': ['hospital', 'health'],
         'farmacia': ['pharmacy', 'drugstore'],
         'delegacia': ['police', 'local_government_office']
     };
    
    // Usar o tipo mapeado ou o tipo original se não houver mapeamento
    const searchTypes = typeMapping[type] || [type];
    
    // Configurar a solicitação de busca com um raio maior
    const request = {
        location: userPosition,
        radius: 5000, // 5km para encontrar mais resultados
        keyword: type, // Adicionar palavra-chave para melhorar os resultados
        type: searchTypes[0] // Usar o primeiro tipo mapeado
    };
    
    // Exibir mensagem de carregamento com animação
    placesList.innerHTML = '<li><div class="loading-spinner"></div>Buscando locais próximos...</li>';
    
    // Realizar a busca
    placesService.nearbySearch(request, (results, status) => {
        // Limpar a mensagem de carregamento
        placesList.innerHTML = '';
        
        if (status === google.maps.places.PlacesServiceStatus.OK && results && results.length > 0) {
            console.log(`Encontrados ${results.length} resultados para ${type}`);
            
            // Adicionar cada local encontrado ao mapa e à lista
            results.forEach((place, index) => {
                if (index < 15) { // Aumentar o limite para 15 resultados
                    createMarker(place);
                    addPlaceToList(place);
                }
            });
        } else {
            console.error(`Erro na busca: ${status}`);
            
            // Tentar novamente com outro tipo se houver mais tipos mapeados
            if (searchTypes.length > 1) {
                const newRequest = {
                    location: userPosition,
                    radius: 5000,
                    keyword: type,
                    type: searchTypes[1]
                };
                
                placesService.nearbySearch(newRequest, (secondResults, secondStatus) => {
                    if (secondStatus === google.maps.places.PlacesServiceStatus.OK && secondResults && secondResults.length > 0) {
                        console.log(`Encontrados ${secondResults.length} resultados na segunda tentativa`);
                        
                        secondResults.forEach((place, index) => {
                            if (index < 15) {
                                createMarker(place);
                                addPlaceToList(place);
                            }
                        });
                    } else {
                        placesList.innerHTML = '<li>Nenhum local encontrado nas proximidades. Tente aumentar o zoom do mapa ou selecionar outra categoria.</li>';
                    }
                });
            } else {
                placesList.innerHTML = '<li>Nenhum local encontrado nas proximidades. Tente aumentar o zoom do mapa ou selecionar outra categoria.</li>';
            }
        }
    });
}

// Criar um marcador para um local
function createMarker(place) {
    // Definir ícones personalizados com base no tipo de local
    let icon;
    
    if (place.types) {
        if (place.types.includes('hospital')) {
            icon = {
                url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png'
            };
        } else if (place.types.includes('pharmacy')) {
            icon = {
                url: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
            };
        } else if (place.types.includes('police')) {
            icon = {
                url: 'http://maps.google.com/mapfiles/ms/icons/purple-dot.png'
            };
        }
    }
    
    const marker = new google.maps.Marker({
        position: place.geometry.location,
        map: map,
        title: place.name,
        animation: google.maps.Animation.DROP,
        icon: icon
    });
    if (place.place_id) {
        placeMarkers[place.place_id] = marker;
    }
    
    const infoWindowContent = `
        <div>
            <h3>${place.name}</h3>
            <p>${place.vicinity || ''}</p>
            ${place.rating ? `<p>Avaliação: ${place.rating} ⭐</p>` : ''}
            <button id="route-btn" class="nav-button primary" style="margin-top:8px">Ver rotas</button>
            <button id="nav-btn" class="nav-button" style="margin-top:8px">Navegar</button>
            <button id="close-iw" class="nav-button secondary" style="margin-top:8px">Fechar</button>
        </div>
    `;
    const infoWindow = new google.maps.InfoWindow({ content: infoWindowContent, disableAutoPan: false, zIndex: 5000 });
    marker.addListener('click', () => {
        currentAnchorMarker = marker;
        map.panTo(place.geometry.location);
        map.setZoom(17);
        if (currentInfoWindow) currentInfoWindow.close();
        infoWindow.open(map, marker);
        currentInfoWindow = infoWindow;
        setTimeout(() => {
            const routeBtn = document.getElementById('route-btn');
            if (routeBtn) routeBtn.addEventListener('click', () => {
                calculateAndDisplayRoute(userPosition, place.geometry.location, place.name);
            });
            const navBtn = document.getElementById('nav-btn');
            if (navBtn) navBtn.addEventListener('click', () => {
                startRealTimeNavigation(place.geometry.location, place.name);
            });
            const closeBtn = document.getElementById('close-iw');
            if (closeBtn) closeBtn.addEventListener('click', () => {
                if (currentInfoWindow) currentInfoWindow.close();
            });
        }, 100);
        if (marker.getAnimation() !== null) {
            marker.setAnimation(null);
        } else {
            marker.setAnimation(google.maps.Animation.BOUNCE);
            setTimeout(() => { marker.setAnimation(null); }, 1500);
        }
    });
    
    // Adicionar o marcador à lista de marcadores
    markers.push(marker);
}

// Adicionar um local à lista de resultados
function addPlaceToList(place) {
    const placesList = document.getElementById('places-results');
    const listItem = document.createElement('li');
    
    listItem.innerHTML = `
        <div class="place-name">${place.name}</div>
        <div class="place-address">${place.vicinity}</div>
    `;
    
    // Adicionar evento de clique para centralizar e abrir popup no marcador
    listItem.addEventListener('click', () => {
        map.panTo(place.geometry.location);
        map.setZoom(17);
        const marker = placeMarkers[place.place_id];
        if (marker) {
            google.maps.event.trigger(marker, 'click');
        }
    });
    
    placesList.appendChild(listItem);
}

// Limpar todos os marcadores do mapa
function clearMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];
}

// Calcular e exibir rota entre dois pontos
function calculateAndDisplayRoute(origin, destination, destinationName, startNavigation = false) {
    // Mostrar indicador de carregamento
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'route-loading';
    loadingDiv.innerHTML = '<div class="loading-spinner"></div><p>Calculando rota...</p>';
    loadingDiv.style.position = 'absolute';
    loadingDiv.style.top = '50%';
    loadingDiv.style.left = '50%';
    loadingDiv.style.transform = 'translate(-50%, -50%)';
    loadingDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    loadingDiv.style.padding = '20px';
    loadingDiv.style.borderRadius = '8px';
    loadingDiv.style.zIndex = '1000';
    document.body.appendChild(loadingDiv);
    
    // Limpar rota anterior
    directionsRenderer.setMap(null);
    directionsRenderer.setMap(map);
    
    // Solicitar rotas alternativas
    const request = {
        origin: origin,
        destination: destination,
        travelMode: google.maps.TravelMode.DRIVING,
        provideRouteAlternatives: true,
        drivingOptions: {
            departureTime: new Date(),
            trafficModel: 'bestguess'
        }
    };
    
    directionsService.route(request, (result, status) => {
        // Remover indicador de carregamento
        document.body.removeChild(loadingDiv);
        
        if (status === google.maps.DirectionsStatus.OK) {
            currentRoute = result;
            currentDestination = destination;
            currentDestinationName = destinationName;
            if (startNavigation) {
                const custom = { ...result };
                custom.routes = [result.routes[selectedRouteIndex] || result.routes[0]];
                directionsRenderer.setMap(null);
                directionsRenderer.setMap(map);
                directionsRenderer.setDirections(custom);
                const leg = custom.routes[0].legs[0];
                routeSteps = leg.steps;
                currentStepIndex = 0;
            } else {
                openRoutesPanel(result, destinationName, destination);
            }
        } else {
            showStatusMessage('Não foi possível calcular a rota: ' + status, 'error');
            
            // Oferecer opção de fallback para Google Maps
            const fallbackDiv = document.createElement('div');
            fallbackDiv.id = 'fallback-options';
            fallbackDiv.innerHTML = `
                <div class="status-message error">
                    <p>Não foi possível calcular a rota. Deseja abrir no Google Maps?</p>
                    <button id="open-google-maps-fallback" class="nav-button">Abrir no Google Maps</button>
                    <button id="close-fallback" class="nav-button">Cancelar</button>
                </div>
            `;
            document.body.appendChild(fallbackDiv);
            
            document.getElementById('open-google-maps-fallback').addEventListener('click', () => {
                const destinationLatLng = typeof destination === 'string' ? destination : `${destination.lat()},${destination.lng()}`;
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${destinationLatLng}&travelmode=driving`, '_blank');
                fallbackDiv.remove();
            });
            
            document.getElementById('close-fallback').addEventListener('click', () => {
                fallbackDiv.remove();
            });
        }
    });
}

function openRoutesPanel(result, destinationName, destination) {
    const existing = document.getElementById('routes-panel');
    if (existing) existing.remove();
    selectedRouteIndex = 0;
    const routesButtons = result.routes.map((r, i) => `
        <button class="route-option ${i === 0 ? 'active' : ''}" data-route-index="${i}">Rota ${i + 1} (${r.legs[0].duration.text})</button>
    `).join('');
    const panel = document.createElement('div');
    panel.id = 'routes-panel';
    panel.innerHTML = `
        <div class="navigation-header">
            <h3>Rotas para ${destinationName}</h3>
            <div class="nav-status"><span>Escolha uma rota</span></div>
        </div>
        <div class="navigation-info">
            <div class="route-alternatives">
                <h4>Rotas alternativas:</h4>
                <div class="route-options">${routesButtons}</div>
            </div>
        </div>
        <div class="navigation-controls">
            <button id="routes-start" class="nav-button primary">Iniciar navegação</button>
            <button id="routes-recalculate" class="nav-button">Recalcular</button>
            <button id="routes-close" class="nav-button danger">Encerrar</button>
        </div>
    `;
    document.body.appendChild(panel);
    const initial = { ...result };
    initial.routes = [result.routes[0]];
    directionsRenderer.setMap(null);
    directionsRenderer.setMap(map);
    directionsRenderer.setDirections(initial);
    const options = panel.querySelectorAll('.route-option');
    options.forEach(opt => {
        opt.addEventListener('click', () => {
            options.forEach(o => o.classList.remove('active'));
            opt.classList.add('active');
            selectedRouteIndex = parseInt(opt.getAttribute('data-route-index'));
            const custom = { ...result };
            custom.routes = [result.routes[selectedRouteIndex]];
            directionsRenderer.setMap(null);
            directionsRenderer.setMap(map);
            directionsRenderer.setDirections(custom);
        });
    });
    document.getElementById('routes-start').addEventListener('click', () => {
        panel.remove();
        startRealTimeNavigation(destination, destinationName);
    });
    document.getElementById('routes-close').addEventListener('click', () => {
        panel.remove();
    });
    document.getElementById('routes-recalculate').addEventListener('click', () => {
        calculateAndDisplayRoute(userPosition, destination, destinationName, false);
    });
}


// Iniciar navegação em tempo real
function startRealTimeNavigation(destination, destinationName) {
    // Verificar permissões de geolocalização
    if (!navigator.geolocation) {
        showStatusMessage('Seu navegador não suporta geolocalização.', 'error');
        return;
    }
    
    // Solicitar permissão para usar geolocalização em segundo plano
    showStatusMessage('Iniciando navegação em tempo real...', 'info');
    
    // Remover painel de rota e criar painel de navegação
    const oldRouteInfo = document.getElementById('route-info');
    if (oldRouteInfo) {
        oldRouteInfo.remove();
    }
    
    // Criar painel de navegação
    const navigationPanel = document.createElement('div');
    navigationPanel.id = 'navigation-panel';
    navigationPanel.innerHTML = `
        <div class="navigation-header">
            <h3>Navegando para ${destinationName}</h3>
            <div class="nav-status">
                <div class="loading-spinner small"></div>
                <span id="nav-status-text">Obtendo sua localização...</span>
            </div>
        </div>
        <div class="navigation-info">
            <div class="distance-time">
                <div class="remaining-distance">
                    <span id="remaining-distance">--</span>
                    <small>restantes</small>
                </div>
                <div class="estimated-time">
                    <span id="estimated-time">--</span>
                    <small>tempo estimado</small>
                </div>
            </div>
            <div class="current-instruction">
                <div id="instruction-icon">➡️</div>
                <div id="current-instruction-text">Calculando rota...</div>
            </div>
            <div class="next-instruction">
                <small>Próximo:</small>
                <div id="next-instruction-text">--</div>
            </div>
        </div>
        <div class="navigation-controls">
            <button id="nav-end-navigation" class="nav-button danger">Encerrar Navegação</button>
            <button id="nav-change-destination" class="nav-button">Outro Destino</button>
            <button id="nav-recalculate" class="nav-button">Recalcular</button>
        </div>
    `;
    
    document.body.appendChild(navigationPanel);
    
    // Adicionar eventos aos botões
    document.getElementById('nav-end-navigation').addEventListener('click', endNavigation);
    document.getElementById('nav-change-destination').addEventListener('click', showChangeDestinationOptions);
    document.getElementById('nav-recalculate').addEventListener('click', () => {
        if (currentDestination) {
            calculateAndDisplayRoute(userPosition, currentDestination, currentDestinationName, true);
        }
    });
    
    // Ativar modo de navegação
    navigationActive = true;
    
    // Iniciar watchPosition para acompanhar a localização do usuário em tempo real
    navigationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            // Atualizar posição do usuário
            userPosition = {
                lat: position.coords.latitude,
                lng: position.coords.longitude
            };
            
            // Atualizar marcador do usuário com animação
            if (userMarker) {
                userMarker.setPosition(userPosition);
                
                // Adicionar classe pulsante ao marcador
                const markerElement = userMarker.getIcon();
                if (markerElement) {
                    markerElement.fillColor = '#4285F4';
                    markerElement.strokeColor = '#FFFFFF';
                    userMarker.setIcon(markerElement);
                }
            }
            
            // Centralizar mapa na posição do usuário
            map.setCenter(userPosition);
            
            // Verificar se o usuário desviou da rota
            checkRouteDeviation();
            
            // Atualizar instruções de navegação
            updateNavigationInstructions();
        },
        (error) => {
            // Tratar erros de geolocalização
            let errorMessage;
            switch (error.code) {
                case error.PERMISSION_DENIED:
                    errorMessage = 'Permissão de geolocalização negada.';
                    break;
                case error.POSITION_UNAVAILABLE:
                    errorMessage = 'Informações de localização indisponíveis.';
                    break;
                case error.TIMEOUT:
                    errorMessage = 'Tempo esgotado ao obter localização.';
                    break;
                default:
                    errorMessage = 'Erro desconhecido ao obter localização.';
            }
            
            showStatusMessage(errorMessage, 'error');
            
            // Oferecer fallback para Google Maps
            const fallbackDiv = document.createElement('div');
            fallbackDiv.id = 'fallback-options';
            fallbackDiv.innerHTML = `
                <div class="status-message error">
                    <p>${errorMessage} Deseja abrir no Google Maps?</p>
                    <button id="open-google-maps-fallback" class="nav-button">Abrir no Google Maps</button>
                    <button id="close-fallback" class="nav-button">Cancelar</button>
                </div>
            `;
            document.body.appendChild(fallbackDiv);
            
            document.getElementById('open-google-maps-fallback').addEventListener('click', () => {
                const destinationLatLng = typeof currentDestination === 'string' ? currentDestination : `${currentDestination.lat()},${currentDestination.lng()}`;
                window.open(`https://www.google.com/maps/dir/?api=1&destination=${destinationLatLng}&travelmode=driving`, '_blank');
                fallbackDiv.remove();
            });
            
            document.getElementById('close-fallback').addEventListener('click', () => {
                fallbackDiv.remove();
            });
            
            // Encerrar navegação
            endNavigation();
        },
        {
            enableHighAccuracy: true,
            maximumAge: 0,
            timeout: 5000
        }
    );
    
    // Iniciar verificação de desvio de rota
    routeDeviationCheckInterval = setInterval(checkRouteDeviation, 10000);
    
    // Calcular e exibir rota inicial
    calculateAndDisplayRoute(userPosition, destination, destinationName, true);
}

// Verificar se o usuário desviou da rota
function checkRouteDeviation() {
    if (!navigationActive || !currentRoute || !userPosition) return;
    
    // Obter a rota atual
    const route = currentRoute.routes[0];
    const path = route.overview_path;
    
    // Encontrar o ponto mais próximo na rota
    let minDistance = Infinity;
    let closestPointIndex = 0;
    
    for (let i = 0; i < path.length; i++) {
        const point = path[i];
        const distance = google.maps.geometry.spherical.computeDistanceBetween(
            new google.maps.LatLng(userPosition.lat, userPosition.lng),
            point
        );
        
        if (distance < minDistance) {
            minDistance = distance;
            closestPointIndex = i;
        }
    }
    
    // Se a distância for maior que 50 metros, considerar como desvio de rota
    if (minDistance > 50) {
        showStatusMessage('Desvio de rota detectado. Recalculando...', 'warning');
        
        // Recalcular rota
        calculateAndDisplayRoute(userPosition, currentDestination, currentDestinationName, true);
    }
}

// Atualizar instruções de navegação
function updateNavigationInstructions() {
    if (!navigationActive || !routeSteps || routeSteps.length === 0) return;
    
    // Encontrar o passo atual com base na posição do usuário
    let closestStepIndex = 0;
    let minDistance = Infinity;
    
    for (let i = currentStepIndex; i < routeSteps.length; i++) {
        const step = routeSteps[i];
        const stepStart = step.start_location;
        
        const distance = google.maps.geometry.spherical.computeDistanceBetween(
            new google.maps.LatLng(userPosition.lat, userPosition.lng),
            stepStart
        );
        
        if (distance < minDistance) {
            minDistance = distance;
            closestStepIndex = i;
        }
    }
    
    // Se o usuário avançou para o próximo passo
    if (closestStepIndex > currentStepIndex) {
        currentStepIndex = closestStepIndex;
        
        // Atualizar instruções na tela
        updateInstructionDisplay();
        
        // Anunciar instrução por voz se suportado
        if (speechSynthesisSupported) {
            speakInstruction(routeSteps[currentStepIndex].instructions);
        }
    }
    
    // Atualizar distância e tempo restantes
    updateRemainingInfo();
}

// Atualizar exibição de instruções
function updateInstructionDisplay() {
    if (!navigationActive || !routeSteps || currentStepIndex >= routeSteps.length) return;
    
    const currentStep = routeSteps[currentStepIndex];
    const nextStep = currentStepIndex + 1 < routeSteps.length ? routeSteps[currentStepIndex + 1] : null;
    
    // Remover tags HTML das instruções
    const currentInstruction = currentStep.instructions.replace(/<[^>]*>/g, '');
    const nextInstruction = nextStep ? nextStep.instructions.replace(/<[^>]*>/g, '') : 'Chegada ao destino';
    
    // Atualizar ícone com base na manobra
    let instructionIcon = '➡️';
    if (currentStep.maneuver) {
        switch (currentStep.maneuver) {
            case 'turn-right':
                instructionIcon = '↪️';
                break;
            case 'turn-left':
                instructionIcon = '↩️';
                break;
            case 'roundabout-right':
            case 'roundabout-left':
                instructionIcon = '🔄';
                break;
            case 'merge':
                instructionIcon = '↘️';
                break;
            case 'ramp-right':
                instructionIcon = '⤴️';
                break;
            case 'ramp-left':
                instructionIcon = '⤵️';
                break;
            case 'fork-right':
                instructionIcon = '⑂';
                break;
            case 'fork-left':
                instructionIcon = '⑃';
                break;
            case 'straight':
                instructionIcon = '⬆️';
                break;
            case 'uturn-right':
            case 'uturn-left':
                instructionIcon = '⮐';
                break;
        }
    }
    
    // Atualizar elementos na tela
    document.getElementById('instruction-icon').textContent = instructionIcon;
    document.getElementById('current-instruction-text').textContent = currentInstruction;
    document.getElementById('next-instruction-text').textContent = nextInstruction;
    
    // Atualizar status
    document.getElementById('nav-status-text').textContent = 'Navegando';
}

// Atualizar informações de distância e tempo restantes
function updateRemainingInfo() {
    if (!navigationActive || !currentRoute) return;
    
    // Recalcular distância e tempo com base na posição atual
    const request = {
        origin: userPosition,
        destination: currentDestination,
        travelMode: google.maps.TravelMode.DRIVING
    };
    
    directionsService.route(request, (result, status) => {
        if (status === google.maps.DirectionsStatus.OK) {
            const leg = result.routes[0].legs[0];
            
            // Atualizar informações na tela
            document.getElementById('remaining-distance').textContent = leg.distance.text;
            document.getElementById('estimated-time').textContent = leg.duration.text;
        }
    });
}

// Falar instrução usando Text-to-Speech
function speakInstruction(instruction) {
    // TRAI: Ativar Text-to-Speech aqui
    if (!speechSynthesisSupported) return;
    
    // Remover tags HTML
    const cleanInstruction = instruction.replace(/<[^>]*>/g, '');
    
    // Criar utterance
    const utterance = new SpeechSynthesisUtterance(cleanInstruction);
    utterance.lang = 'pt-BR';
    utterance.volume = 1;
    utterance.rate = 1;
    utterance.pitch = 1;
    
    // Falar
    window.speechSynthesis.speak(utterance);
}

// Encerrar navegação
function endNavigation() {
    // Desativar modo de navegação
    navigationActive = false;
    
    // Parar watchPosition
    if (navigationWatchId !== null) {
        navigator.geolocation.clearWatch(navigationWatchId);
        navigationWatchId = null;
    }
    
    // Limpar intervalo de verificação de desvio
    if (routeDeviationCheckInterval) {
        clearInterval(routeDeviationCheckInterval);
        routeDeviationCheckInterval = null;
    }
    
    // Limpar rota
    directionsRenderer.setMap(null);
    
    // Remover painel de navegação
    const navPanel = document.getElementById('navigation-panel');
    if (navPanel) {
        navPanel.remove();
    }
    
    // Perguntar se deseja salvar o destino nos favoritos
    if (currentDestination && currentDestinationName) {
        showSaveFavoritesPrompt(currentDestination, currentDestinationName);
    }
    
    // Resetar variáveis
    currentRoute = null;
    routeSteps = [];
    currentStepIndex = 0;
}

// Mostrar opções para mudar de destino
function showChangeDestinationOptions() {
    // Criar painel de opções
    const optionsPanel = document.createElement('div');
    optionsPanel.id = 'change-destination-panel';
    optionsPanel.innerHTML = `
        <div class="options-panel">
            <h3>Escolher outro destino</h3>
            <div class="options-list">
                <button id="search-nearby" class="option-btn">Locais próximos</button>
                <button id="search-address" class="option-btn">Buscar endereço</button>
                <button id="cancel-change" class="option-btn secondary">Cancelar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(optionsPanel);
    
    // Adicionar eventos
    document.getElementById('search-nearby').addEventListener('click', () => {
        optionsPanel.remove();
        
        // Mostrar filtros de locais
        document.querySelector('.places-filter').classList.add('highlight');
        
        // Adicionar evento temporário para capturar clique em filtro
        const filterHandler = (e) => {
            if (e.target.classList.contains('filter-btn')) {
                document.querySelector('.places-filter').classList.remove('highlight');
                document.removeEventListener('click', filterHandler);
            }
        };
        
        document.addEventListener('click', filterHandler);
    });
    
    document.getElementById('search-address').addEventListener('click', () => {
        optionsPanel.remove();
        showAddressSearchPanel();
    });
    
    document.getElementById('cancel-change').addEventListener('click', () => {
        optionsPanel.remove();
    });
}

// Mostrar painel de busca de endereço
function showAddressSearchPanel() {
    const searchPanel = document.createElement('div');
    searchPanel.id = 'address-search-panel';
    searchPanel.innerHTML = `
        <div class="search-panel">
            <h3>Buscar endereço</h3>
            <div class="search-form">
                <input type="text" id="address-input" placeholder="Digite um endereço ou local">
                <button id="search-address-btn">Buscar</button>
                <button id="cancel-search" class="secondary">Cancelar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(searchPanel);
    
    // Adicionar eventos
    document.getElementById('search-address-btn').addEventListener('click', () => {
        const address = document.getElementById('address-input').value;
        if (address.trim() === '') return;
        
        // Geocodificar endereço
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address: address }, (results, status) => {
            if (status === google.maps.GeocoderStatus.OK && results[0]) {
                const location = results[0].geometry.location;
                
                // Calcular rota para o novo endereço
                calculateAndDisplayRoute(userPosition, location, results[0].formatted_address, navigationActive);
                
                // Fechar painel de busca
                searchPanel.remove();
            } else {
                showStatusMessage('Endereço não encontrado. Tente novamente.', 'error');
            }
        });
    });
    
    document.getElementById('cancel-search').addEventListener('click', () => {
        searchPanel.remove();
    });
    
    // Focar no campo de entrada
    document.getElementById('address-input').focus();
}

// Mostrar prompt para salvar nos favoritos
function showSaveFavoritesPrompt(destination, destinationName) {
    const promptDiv = document.createElement('div');
    promptDiv.id = 'save-favorites-prompt';
    promptDiv.innerHTML = `
        <div class="prompt-panel">
            <h3>Salvar nos favoritos?</h3>
            <p>Deseja salvar "${destinationName}" nos seus favoritos?</p>
            <div class="prompt-buttons">
                <button id="save-favorite" class="prompt-btn primary">Salvar</button>
                <button id="dont-save" class="prompt-btn">Não salvar</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(promptDiv);
    
    // Adicionar eventos
    document.getElementById('save-favorite').addEventListener('click', () => {
        // Salvar nos favoritos (implementação básica usando localStorage)
        const favorites = JSON.parse(localStorage.getItem('favorites') || '[]');
        favorites.push({
            name: destinationName,
            location: {
                lat: typeof destination.lat === 'function' ? destination.lat() : destination.lat,
                lng: typeof destination.lng === 'function' ? destination.lng() : destination.lng
            }
        });
        localStorage.setItem('favorites', JSON.stringify(favorites));
        
        showStatusMessage('Local salvo nos favoritos!', 'success');
        promptDiv.remove();
    });
    
    document.getElementById('dont-save').addEventListener('click', () => {
        promptDiv.remove();
    });
}

// Exibir mensagem de status
function showStatusMessage(message, type = 'info') {
    const statusDiv = document.createElement('div');
    statusDiv.className = `status-message ${type}`;
    statusDiv.innerHTML = `<p>${message}</p>`;
    
    document.body.appendChild(statusDiv);
    
    // Remover após alguns segundos
    setTimeout(() => {
        statusDiv.classList.add('fade-out');
        setTimeout(() => {
            if (document.body.contains(statusDiv)) {
                document.body.removeChild(statusDiv);
            }
        }, 500);
    }, 3000);
}
