const siteBaseUrl = "https://7embeddecanais.xyz";

export default [
    /* ABERTOS */
    {
        "nome": "Globo MG",
        "tvg_id": "Globo MG",
        "url": `${siteBaseUrl}/globomg/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/globo_mg.png",
        "categoria": "Abertos",
        "provedor": "site",
        "provedor_fixo": true
    },
    {
        "nome": "Globo",
        "tvg_id": "Globo MG",
        "url": `http://hls1.sua.tv/live/globominashd/s.m3u8`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/globo.png",
        "categoria": "Abertos",
        // "filtro_cdn": "Globo SP",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Band",
        "tvg_id": "Band MG",
        "url": `${siteBaseUrl}/bandsp/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/band.png",
        "categoria": "Abertos",
        "filtro_cdn": "Band MG",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "TV Alterosa",
        "nome_api": "SBT",
        "tvg_id": "SBT MG",
        "url": `${siteBaseUrl}/sbtsp/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tv_alterosa.png",
        "categoria": "Abertos",
        "filtro_cdn": "SBT MG",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Rede TV",
        "tvg_id": "REDE TV! HD",
        "url": `${siteBaseUrl}/redetv/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/rede_tv.png",
        "categoria": "Abertos",
        "provedor": "site",
        "provedor_fixo": true
    },
    {
        "nome": "Record MG",
        "tvg_id": "Record MG",
        "url": `${siteBaseUrl}/recordmg/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/record_mg.png",
        "categoria": "Abertos",
        "provedor": "site",
        "provedor_fixo": true
    },
    {
        "nome": "Futura",
        "tvg_id": "FUTURA HD",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/futura.png",
        "categoria": "Abertos",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "TV Brasil",
        "tvg_id": "TV BRASIL",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tv_brasil.png",
        "categoria": "Abertos",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "TV Cultura",
        "tvg_id": "CULTURA HD",
        "url": `${siteBaseUrl}/tvcultura/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tv_cultura.png",
        "categoria": "Abertos",
        "provedor": "api",
        "provedor_fixo": false
    },

    /* FILMES E SÉRIES */
    {
        "nome": "A&E",
        "tvg_id": "A&E",
        "url": `${siteBaseUrl}/aee/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/ae.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "AMC",
        "tvg_id": "AMC HD",
        "url": `${siteBaseUrl}/amc/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/amc.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "AXN",
        "tvg_id": "AXN",
        "url": `${siteBaseUrl}/axn/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/axn.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Canal Brasil",
        "tvg_id": "CANAL BRASIL HD",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/canal_brasil.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Cinemax",
        "tvg_id": "CINEMAX HD",
        "url": `${siteBaseUrl}/cinemax/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/cinemax.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO",
        "tvg_id": "HBO",
        "url": `${siteBaseUrl}/hbo/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO 2",
        "tvg_id": "HBO2",
        "url": `${siteBaseUrl}/hbo2/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_2.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO Family",
        "tvg_id": "HBO Family",
        "url": `${siteBaseUrl}/hbofamily/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_family.png",
        "categoria": "Filmes e Séries",
        "filtro_cdn": "Opção 02",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO Mundi",
        "tvg_id": "HBO Mundi",
        "url": `${siteBaseUrl}/hbomundi/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_mundi.png",
        "categoria": "Filmes e Séries",
        "provedor": "site",
        "provedor_fixo": true
    },
    {
        "nome": "HBO Plus",
        "tvg_id": "HBO+",
        "url": `${siteBaseUrl}/hboplus/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_plus.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO Pop",
        "tvg_id": "HBO Pop",
        "url": `${siteBaseUrl}/hbopop/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_pop.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO Signature",
        "tvg_id": "HBO Signature",
        "url": `${siteBaseUrl}/hbosignature/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_signature.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO Xtreme",
        "tvg_id": "HBO Xtreme",
        "url": `${siteBaseUrl}/hboxtreme/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_xtreme.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Megapix",
        "tvg_id": "MEGAPIX HD",
        "url": `${siteBaseUrl}/megapix/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/megapix.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Sony Channel",
        "tvg_id": "SONY CHANNEL",
        "url": `${siteBaseUrl}/sonychannel/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/sony_channel.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Space",
        "tvg_id": "SPACE HD",
        "url": `${siteBaseUrl}/space/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/space.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Studio Universal",
        "tvg_id": "STUDIO UNIVERSAL HD",
        "url": `${siteBaseUrl}/studiouniversal/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/studio_universal.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "TCM",
        "tvg_id": "TCM BR",
        "url": `${siteBaseUrl}/tcm/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tcm.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Telecine Action",
        "tvg_id": "TELECINE ACTION",
        "url": `${siteBaseUrl}/tcaction/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/telecine_action.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Telecine Cult",
        "tvg_id": "TELECINE CULT",
        "url": `${siteBaseUrl}/tccult/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/telecine_cult.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Telecine Fun",
        "tvg_id": "TELECINE FUN",
        "url": `${siteBaseUrl}/tcfun/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/telecine_fun.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Telecine Pipoca",
        "tvg_id": "TELECINE PIPOCA",
        "url": `${siteBaseUrl}/tcpipoca/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/telecine_pipoca.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Telecine Premium",
        "tvg_id": "TELECINE PREMIUM",
        "url": `${siteBaseUrl}/tcpremium/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/telecine_premium.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Telecine Touch",
        "tvg_id": "TELECINE TOUCH",
        "url": `${siteBaseUrl}/tctouch/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/telecine_touch.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "TNT",
        "tvg_id": "TNT HD",
        "url": `${siteBaseUrl}/tnt/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tnt.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "TNT Novelas",
        "tvg_id": "TNT NOVELAS",
        "url": `${siteBaseUrl}/tntnovelas/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tnt_novelas.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "TNT Séries",
        "tvg_id": "TNT SERIES HD",
        "url": `${siteBaseUrl}/tntseries/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tnt_sries.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Universal TV",
        "tvg_id": "UNIVERSAL TV HD",
        "url": `${siteBaseUrl}/universaltv/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/universal_tv.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "USA",
        "tvg_id": "USA HD",
        "url": `${siteBaseUrl}/paramountnetwork/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/usa.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Warner",
        "tvg_id": "WARNER CHANNEL",
        "url": `${siteBaseUrl}/warner/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/warner.png",
        "categoria": "Filmes e Séries",
        "provedor": "api",
        "provedor_fixo": false
    },

    /* VARIEDADES */
    {
        "nome": "Bis",
        "tvg_id": "BIS HD",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/bis.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Curta!",
        "tvg_id": "CURTA",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/curta.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Fish TV",
        "tvg_id": "FISH TV",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/fish_tv.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Food Network",
        "tvg_id": "FOOD NETWORK HD",
        "url": `${siteBaseUrl}/foodnetwork/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/food_network.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Globoplay Novelas",
        "tvg_id": "Globoplay Novelas",
        "url": `${siteBaseUrl}/globoplaynovelas/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/globoplay_novelas.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "GNT",
        "tvg_id": "GNT HD",
        "url": `${siteBaseUrl}/gnt/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/gnt.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Lifetime",
        "tvg_id": "LIFETIME",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/lifetime.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Modo Viagem",
        "tvg_id": "Modo Viagem",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/modo_viagem.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Multishow",
        "tvg_id": "MULTISHOW HD",
        "url": `${siteBaseUrl}/multishow/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/multishow.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Music Box Brazil",
        "tvg_id": "MUSIC BOX BRAZIL",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/music_box_brazil.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Prime Box Brazil",
        "tvg_id": "PRIME BOX BRAZIL",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/prime_box_brazil.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "TLC",
        "tvg_id": "TLC HD",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tlc.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Travel Box Brazil",
        "tvg_id": "TRAVEL BOX",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/travel_box_brazil.png",
        "categoria": "Variedades",
        "provedor": "api",
        "provedor_fixo": true
    },

    /* DOCUMENTÁRIOS */
    {
        "nome": "Animal Planet",
        "tvg_id": "ANIMAL PLANET HD",
        "url": `${siteBaseUrl}/animalplanet/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/animal_planet.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Arte1",
        "tvg_id": "ARTE 1 HD",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/arte1.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Discovery Channel",
        "tvg_id": "DISCOVERY HD",
        "url": `${siteBaseUrl}/discoverychannel/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/discovery_channel.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Discovery Home & Health",
        "tvg_id": "DISCOVERY HOME&HEALTH HD",
        "url": `${siteBaseUrl}/discoveryhh/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/discovery_home__health.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Discovery Science",
        "tvg_id": "DISCOVERY SCIENCE HD",
        "url": `${siteBaseUrl}/discoveryscience/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/discovery_science.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Discovery Theater",
        "tvg_id": "DISCOVERY THEATER HD",
        "url": `${siteBaseUrl}/discoverytheater/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/discovery_theater.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Discovery Turbo",
        "tvg_id": "DISCOVERY TURBO HD",
        "url": `${siteBaseUrl}/discoveryturbo/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/discovery_turbo.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Discovery World",
        "tvg_id": "DISCOVERY WORLD HD",
        "url": `${siteBaseUrl}/discoveryworld/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/discovery_world.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "E! Entertainment",
        "tvg_id": "E!",
        "url": `${siteBaseUrl}/eentertainment/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/e_entertainment.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HGTV",
        "tvg_id": "HGTV HD",
        "url": `${siteBaseUrl}/hgtv/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hgtv.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "History",
        "tvg_id": "HISTORY",
        "url": `${siteBaseUrl}/history/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/history.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "History 2",
        "tvg_id": "HISTORY 2",
        "url": `${siteBaseUrl}/history2/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/history_2.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Investigação Discovery",
        "tvg_id": "ID HD",
        "url": `${siteBaseUrl}/discoveryid/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/investigao_discovery.png",
        "categoria": "Documentários",
        "provedor": "api",
        "provedor_fixo": false
    },

    /* INFANTIS */
    {
        "nome": "Adult Swim",
        "tvg_id": "Adult Swim HD",
        "url": `${siteBaseUrl}/adultswim/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/adult_swim.png",
        "categoria": "Infantis",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Cartoon Network",
        "tvg_id": "CARTOON HD",
        "url": `${siteBaseUrl}/cartoonnetwork/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/cartoon_network.png",
        "categoria": "Infantis",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Cartoonito",
        "tvg_id": "CARTOONITO",
        "url": `${siteBaseUrl}/cartoonito/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/cartoonito.png",
        "categoria": "Infantis",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Discovery Kids",
        "tvg_id": "DISCOVERY KIDS HD",
        "url": `${siteBaseUrl}/discoverykids/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/discovery_kids.png",
        "categoria": "Infantis",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Gloob",
        "tvg_id": "GLOOB HD",
        "url": `${siteBaseUrl}/gloob/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/gloob.png",
        "categoria": "Infantis",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Gloobinho",
        "tvg_id": "GLOOBINHO HD",
        "url": `${siteBaseUrl}/gloobinho/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/gloobinho.png",
        "categoria": "Infantis",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Tooncast",
        "tvg_id": "",
        "url": `${siteBaseUrl}/tooncast/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/tooncast.png",
        "categoria": "Infantis",
        "provedor": "api",
        "provedor_fixo": false
    },

    /* ESPORTES */
    {
        "nome": "Amazon Prime Video 1",
        "tvg_id": "",
        "url": `${siteBaseUrl}/amazonprimevideo/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/amazon_prime_video_1.png",
        "categoria": "Esportes",
        "nome_api": "Prime Vídeo",
        "filtro_cdn": "Opção 01",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Amazon Prime Video 2",
        "tvg_id": "",
        "url": `${siteBaseUrl}/amazonprimevideo02/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/amazon_prime_video_2.png",
        "categoria": "Esportes",
        "nome_api": "Prime Vídeo",
        "filtro_cdn": "Opção 02",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Amazon Prime Video 3",
        "tvg_id": "",
        "url": `${siteBaseUrl}/amazonprimevideo03/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/amazon_prime_video_3.png",
        "categoria": "Esportes",
        "nome_api": "Prime Vídeo",
        "filtro_cdn": "Opção 03",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Amazon Prime Video 4",
        "tvg_id": "",
        "url": `${siteBaseUrl}/amazonprimevideo04/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/amazon_prime_video_4.png",
        "categoria": "Esportes",
        "provedor": "site",
        "provedor_fixo": true
    },
    {
        "nome": "Amazon Prime Video 5",
        "tvg_id": "",
        "url": `${siteBaseUrl}/amazonprimevideo05/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/amazon_prime_video_5.png",
        "categoria": "Esportes",
        "provedor": "site",
        "provedor_fixo": true
    },
    {
        "nome": "Apple TV",
        "tvg_id": "",
        "url": `${siteBaseUrl}/appletv01/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/apple_tv.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Band Sports",
        "tvg_id": "BAND SPORTS HD",
        "url": `${siteBaseUrl}/bandsports/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/band_sports.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Canal Goat",
        "tvg_id": "",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/canal_goat.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Canal Off",
        "tvg_id": "OFF HD",
        "url": `${siteBaseUrl}/canaloff/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/canal_off.png",
        "categoria": "Esportes",
        "provedor": "site",
        "provedor_fixo": true
    },
    // {
    //     "nome": "Caze TV",
    //     "tvg_id": "",
    //     "url": `${siteBaseUrl}/cazetv/`,
    //     "logo": "",
    //     "categoria": "Esportes",
    //     "provedor": "site",
    // },
    {
        "nome": "Combate",
        "tvg_id": "COMBATE HD",
        "url": `${siteBaseUrl}/combate/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/combate.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Dazn",
        "tvg_id": "",
        "url": `${siteBaseUrl}/dazn/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/dazn.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "ESPN",
        "tvg_id": "ESPN",
        "url": `${siteBaseUrl}/espn/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/espn.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "ESPN 2",
        "tvg_id": "ESPN 2",
        "url": `${siteBaseUrl}/espn2/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/espn_2.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "ESPN 3",
        "tvg_id": "ESPN 3",
        "url": `${siteBaseUrl}/espn3/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/espn_3.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "ESPN 4",
        "tvg_id": "ESPN 4",
        "url": `${siteBaseUrl}/espn4/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/espn_4.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "ESPN 5",
        "tvg_id": "ESPN 5",
        "url": `${siteBaseUrl}/espn5/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/espn_5.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "ESPN 6",
        "tvg_id": "ESPN 6",
        "url": `${siteBaseUrl}/espn6/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/espn_6.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "GE TV",
        "tvg_id": "GE",
        "url": `${siteBaseUrl}/getv/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/ge_tv.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO Max",
        "tvg_id": "",
        "url": `${siteBaseUrl}/max/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_max.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO Max 2",
        "tvg_id": "",
        "url": `${siteBaseUrl}/max02/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_max_2.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO Max 3",
        "tvg_id": "",
        "url": `${siteBaseUrl}/max03/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_max_3.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO Max 4",
        "tvg_id": "",
        "url": `${siteBaseUrl}/max04/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_max_4.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "HBO Max 5",
        "tvg_id": "",
        "url": `${siteBaseUrl}/max05/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_max_5.png",
        "categoria": "Esportes",
        "provedor": "site",
        "provedor_fixo": true
    },
    {
        "nome": "HBO Max 6",
        "tvg_id": "",
        "url": `${siteBaseUrl}/max06/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/hbo_max_6.png",
        "categoria": "Esportes",
        "provedor": "site",
        "provedor_fixo": true
    },
    {
        "nome": "Paramount+",
        "tvg_id": "",
        "url": `${siteBaseUrl}/paramountplus/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/paramount.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Paramount+ 2",
        "tvg_id": "Paramount+ 2",
        "url": `${siteBaseUrl}/paramountplus02/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/paramount_2.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Paramount+ 3",
        "tvg_id": "Paramount+ 3",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/paramount_3.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Paramount+ 4",
        "tvg_id": "Paramount+ 4",
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/paramount_4.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": true
    },
    {
        "nome": "Premiere 2",
        "tvg_id": "PREMIERE 2 HD",
        "url": `${siteBaseUrl}/premiere2/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/premiere_2.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Premiere 3",
        "tvg_id": "PREMIERE 3 HD",
        "url": `${siteBaseUrl}/premiere3/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/premiere_3.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Premiere 4",
        "tvg_id": "PREMIERE 4 HD",
        "url": `${siteBaseUrl}/premiere4/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/premiere_4.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Premiere 5",
        "tvg_id": "PREMIERE 5 HD",
        "url": `${siteBaseUrl}/premiere5/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/premiere_5.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Premiere 6",
        "tvg_id": "PREMIERE 6 HD",
        "url": `${siteBaseUrl}/premiere6/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/premiere_6.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Premiere 7",
        "tvg_id": "PREMIERE 7 HD",
        "url": `${siteBaseUrl}/premiere7/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/premiere_7.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Premiere 8",
        "tvg_id": "",
        "url": `${siteBaseUrl}/premiere8/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/premiere_8.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Premiere Clubes",
        "tvg_id": "PREMIERE CLUBES HD",
        "url": `${siteBaseUrl}/premiereclubes/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/premiere_clubes.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "SporTV",
        "tvg_id": "SPORTV",
        "url": `${siteBaseUrl}/sportv/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/sportv.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "SporTV 2",
        "tvg_id": "SPORTV 2",
        "url": `${siteBaseUrl}/sportv2/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/sportv_2.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "SporTV 3",
        "tvg_id": "SPORTV 3",
        "url": `${siteBaseUrl}/sportv3/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/sportv_3.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "XSports",
        "tvg_id": "Xsports HD",
        "url": `${siteBaseUrl}/xsports/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/xsports.png",
        "categoria": "Esportes",
        "provedor": "api",
        "provedor_fixo": false
    },

    /* NOTÍCIAS */
    {
        "nome": "Band News",
        "tvg_id": "BAND NEWS",
        "url": `${siteBaseUrl}/bandnews/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/band_news.png",
        "categoria": "Notícias",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "CNN Brasil",
        "tvg_id": "CNN BRASIL",
        "url": `${siteBaseUrl}/cnnbrasil/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/cnn_brasil.png",
        "categoria": "Notícias",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Globo News",
        "tvg_id": "GLOBONEWS",
        "url": `${siteBaseUrl}/globonews/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/globo_news.png",
        "categoria": "Notícias",
        "provedor": "api",
        "provedor_fixo": false
    },
    {
        "nome": "Record News",
        "tvg_id": "RECORD NEWS",
        "url": `${siteBaseUrl}/recordnews/`,
        "logo": "https://raw.githubusercontent.com/homefelix08-dotcom/network-metrics-test/main/assets/record_news.png",
        "categoria": "Notícias",
        "provedor": "api",
        "provedor_fixo": false
    }
]
