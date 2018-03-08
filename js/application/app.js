/*
 | Copyright 2018 Esri
 |
 | Licensed under the Apache License, Version 2.0 (the "License");
 | you may not use this file except in compliance with the License.
 | You may obtain a copy of the License at
 |
 |    http://www.apache.org/licenses/LICENSE-2.0
 |
 | Unless required by applicable law or agreed to in writing, software
 | distributed under the License is distributed on an "AS IS" BASIS,
 | WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 | See the License for the specific language governing permissions and
 | limitations under the License.
 */
define([
  "calcite",
  "boilerplate/ItemHelper",
  "boilerplate/UrlParamHelper",
  "dojo/i18n!./nls/resources",
  "dojo/_base/declare",
  "dojo/_base/Color",
  "dojo/colors",
  "dojo/date/locale",
  "dojo/number",
  "dojo/query",
  "dojo/on",
  "dojo/dom",
  "dojo/dom-attr",
  "dojo/dom-class",
  "dojo/dom-geometry",
  "dojo/dom-construct",
  "esri/identity/IdentityManager",
  "esri/request",
  "esri/core/watchUtils",
  "esri/core/promiseUtils",
  "esri/portal/Portal",
  "esri/portal/PortalItem",
  "esri/portal/PortalQueryParams",
  "esri/layers/Layer"
], function (calcite, ItemHelper, UrlParamHelper, i18n, declare, Color, colors, locale, number, query, on,
             dom, domAttr, domClass, domGeom, domConstruct,
             IdentityManager, esriRequest, watchUtils, promiseUtils, Portal, PortalItem, PortalQueryParams, Layer) {

  return declare(null, {

    config: null,
    direction: null,

    /**
     *
     */
    constructor: function () {
      calcite.init();
    },

    /**
     *
     * @param boilerplateResponse
     */
    init: function (boilerplateResponse) {
      if(boilerplateResponse) {
        this.direction = boilerplateResponse.direction;
        this.config = boilerplateResponse.config;
        this.settings = boilerplateResponse.settings;

        document.documentElement.lang = boilerplateResponse.locale;

        // TITLE //
        document.title = dom.byId("app-title-node").innerHTML = this.config.title;

        // USER SIGN IN //
        this.initializeUserSignIn().then(() => {
          // ORG SERVICES //
          this.initializeOrgServices(this.portal);
        });

      }
    },

    /**
     * USER SIGN IN
     */
    initializeUserSignIn: function () {

      // TOGGLE SIGN IN/OUT //
      let signInNode = dom.byId("sign-in-node");
      let signOutNode = dom.byId("sign-out-node");
      let userNode = dom.byId("user-node");

      // SIGN IN //
      let userSignIn = () => {
        this.portal = new Portal({ authMode: "immediate" });
        return this.portal.load().then(() => {
          //console.info(this.portal, this.portal.user);

          dom.byId("user-firstname-node").innerHTML = this.portal.user.fullName.split(" ")[0];
          dom.byId("user-fullname-node").innerHTML = this.portal.user.fullName;
          dom.byId("username-node").innerHTML = this.portal.user.username;
          dom.byId("user-thumb-node").src = this.portal.user.thumbnailUrl;

          domClass.add(signInNode, "hide");
          domClass.remove(userNode, "hide");
        }).otherwise(console.warn);
      };

      // SIGN OUT //
      let userSignOut = () => {
        IdentityManager.destroyCredentials();
        this.portal = new Portal({});
        this.portal.load().then(() => {

          this.portal.user = null;
          domClass.remove(signInNode, "hide");
          domClass.add(userNode, "hide");

        }).otherwise(console.warn);
      };

      // CALCITE CLICK EVENT //
      on(signInNode, "click", userSignIn);
      on(signOutNode, "click", userSignOut);

      // PORTAL //
      this.portal = new Portal({});
      return this.portal.load().then(() => {
        // CHECK THE SIGN IN STATUS WHEN APP LOADS //
        return IdentityManager.checkSignInStatus(this.portal.url).always(userSignIn);
      }).otherwise(console.warn);
    },

    /**
     *
     * @param portal
     */
    initializeOrgServices: function (portal) {

      
      // PORTAL URL USED TO BUILD ITEM PAGE URLS //
      this.portalUrl = portal ? (portal.urlKey ? `https://${portal.urlKey}.${portal.customBaseUrl}` : portal.url) : "https://www.arcgis.com";

      // INITIALIZE USERS //
      this.initializeUsers(portal).then(() => {

        // INITIALIZE FILTERS //
        this.initializeFilters();

        // ITEMS SEARCH QUERIES //
        const orgQuery = `(orgid:${portal.id})`;
        const servicesQuery = `(typekeywords:"Service" AND typekeywords:"-Data")`;
        const mapsQuery = `((type:"Web Map" OR type:"Web Scene" OR type:"Web Mapping Application") AND (-type:"CityEngine Web Scene"))`;

        // SERVICE ITEMS //
        const orgServiceItemsQuery = {
          query: `${orgQuery} AND ${servicesQuery}`,
          sortField: "numViews",
          sortOrder: "desc",
          num: 100
        };
        const servicesHandle = this.getServiceItems(portal, orgServiceItemsQuery);

        // MAP ITEMS //
        const orgMapItemsQuery = {
          query: `${orgQuery} AND ${mapsQuery}`,
          sortField: "numViews",
          sortOrder: "desc",
          num: 100
        };
        const mapsHandle = this.getMapItems(portal, orgMapItemsQuery);

        promiseUtils.eachAlways([servicesHandle, mapsHandle]).then(() => {
          domClass.add("items-count", "label-blue");
        });

      });

    },

    /**
     *
     * @param portal
     */
    initializeUsers: function (portal) {

      // ORG USERS //
      const orgUsers = new Map();
      // FIND ORG USER //
      this.findOrgUser = (username) => {
        return orgUsers.get(username);
      };

      // GET ORG USERS DIRECTLY FROM PORTAL //
      if(portal.user) {
        return esriRequest(`${this.portalUrl}/sharing/rest/portals/self/users`, {
          query: { f: "json", start: 1, num: 100 }
        }).then((response) => {
          domConstruct.create("optgroup", { label: `Users in the '${portal.name}' Organization` }, "user-select");
          response.data.users.forEach((orgUser) => {
            orgUsers.set(orgUser.username, orgUser);
            domConstruct.create("option", {
              value: orgUser.username,
              innerHTML: `${orgUser.username}&nbsp;&nbsp;&nbsp;( ${orgUser.fullName} )`,
              title: `Role: ${orgUser.role} Level: ${orgUser.level} Email: ${orgUser.email}`
            }, "user-select");
          });
          domConstruct.create("optgroup", { label: "Users NOT in this Organization" }, "user-select");

        });
      } else {
        return promiseUtils.resolve();
      }

      /*this.getUserEmail = (username) => {
        if(userEmails.has(username)) {
          return promiseUtils.resolve(userEmails.get(username));
        } else {
          return portal.queryUsers({ query: username, num: 100 }).then((queryResult) => {
            if(queryResult.results.length > 0) {
              const user = queryResult.results.find((userInfo) => {
                return (userInfo.username === username);
              });
              if(user) {
                // FOUND USER WITH THE SAME USERNAME //
                userEmails.set(username, user.email);
                return user.email;
              } else {
                // FOUND CANDIDATE USERS BUT NONE OF THEM HAVE THE SAME USERNAME //
                return promiseUtils.resolve();
              }
            } else {
              // FOUND NO CANDIDATE USERS //
              return promiseUtils.resolve();
            }
          });
        }
      };*/
    },

    /**
     *
     */
    initializeFilters: function () {

      // SERVICE URLS INFOS //
      this.serviceURLInfos = new Map();
      this.updateServicesCount = () => {
        dom.byId("items-count").innerHTML = number.format(this.serviceURLInfos.size);
      };


      // ITEM FILTER //
      let itemFilter = { type: null, value: null };
      const _updateItemFilter = (type, value) => {
        itemFilter.typs = type;
        itemFilter.value = value;
      };

      this.filterItem = (item) => {
        if(itemFilter.type) {
          return (item[itemFilter.type] === itemFilter.value);
        } else {
          return true;
        }
      };


      // UPDATE SERVICE FILTER //
      const _updateServiceFilter = (serviceURLInfos) => {
        domConstruct.empty("related-node");
        query(".service-node").removeClass("selected");
        if(serviceURLInfos) {
          query(".service-node").addClass("hide");
          serviceURLInfos.forEach((serviceURLInfo) => {
            domClass.remove(serviceURLInfo.serviceNode, "hide");
          });
          dom.byId("items-count").innerHTML = `${serviceURLInfos.length} of ${number.format(this.serviceURLInfos.size)}`;
        } else {
          query(".service-node").removeClass("hide");
          this.updateServicesCount();
        }
      };

      // ITEM ACCESS //
      this.serviceInfoByAccess = new Map();
      this.serviceInfoByAccess.set("public", []);
      this.serviceInfoByAccess.set("org", []);
      this.serviceInfoByAccess.set("shared", []);
      this.serviceInfoByAccess.set("private", []);
      const updateServiceAccessFilter = () => {
        userSelect.value = "NO-USER-FILTER";
        serverURLsSelect.value = "NO-SERVER-FILTER";
        if(accessSelect.value === "NO-ACCESS-FILTER") {
          _updateServiceFilter();
          _updateItemFilter(null, null);
        } else {
          _updateServiceFilter(this.serviceInfoByAccess.get(accessSelect.value));
          _updateItemFilter("access", accessSelect.value);
        }
      };
      const accessSelect = dom.byId("access-select");
      on(accessSelect, "change", () => {
        updateServiceAccessFilter();
      });
      /*on(dom.byId("clear-access-filter"), "click", () => {
        accessSelect.value = "NO-ACCESS-FILTER";
        updateServiceAccessFilter();
      });*/

      // USERNAMES //
      this.usernames = new Map();
      const updateServiceUserFilter = () => {
        accessSelect.value = "NO-ACCESS-FILTER";
        serverURLsSelect.value = "NO-SERVER-FILTER";
        if(userSelect.value === "NO-USER-FILTER") {
          _updateServiceFilter();
          _updateItemFilter(null, null);
        } else {
          _updateServiceFilter(this.usernames.get(userSelect.value));
          _updateItemFilter("owner", userSelect.value);
        }
      };
      const userSelect = dom.byId("user-select");
      on(userSelect, "change", () => {
        updateServiceUserFilter();
      });
      /*on(dom.byId("clear-user-filter"), "click", () => {
        userSelect.value = "NO-USER-FILTER";
        updateServiceUserFilter();
      });*/

      // SERVER URLS //
      this.serverURLs = new Map();
      const updateServiceServerFilter = () => {
        accessSelect.value = "NO-ACCESS-FILTER";
        userSelect.value = "NO-USER-FILTER";
        _updateItemFilter(null, null);
        _updateServiceFilter((serverURLsSelect.value === "NO-SERVER-FILTER") ? null : this.serverURLs.get(serverURLsSelect.value));
      };
      const serverURLsSelect = dom.byId("server-select");
      on(serverURLsSelect, "change", () => {
        updateServiceServerFilter();
      });
      /*on(dom.byId("clear-server-filter"), "click", () => {
        serverURLsSelect.value = "NO-SERVER-FILTER";
        updateServiceServerFilter();
      });*/

      // CLEAR FILTERS //
      const clearFiltersBtn = dom.byId("clear-filters-btn");
      on(clearFiltersBtn, "click", () => {
        serverURLsSelect.value = "NO-SERVER-FILTER";
        userSelect.value = "NO-USER-FILTER";
        accessSelect.value = "NO-ACCESS-FILTER";
        _updateItemFilter(null, null);
        _updateServiceFilter();
        domConstruct.empty("related-node");
      });

      // CLEAR RELATED ITEMS //
      const clearRelatedItemsNode = dom.byId("clear-related-items");
      on(clearRelatedItemsNode, "click", () => {
        domConstruct.empty("related-node");
      });

    },

    /**
     *
     * @param portal
     * @param queryParams
     * @private
     */
    getServiceItems: function (portal, queryParams) {
      return portal.queryItems(queryParams).then((queryResult) => {
        const inspectHandle = this.inspectServiceItems(queryResult.results).then(() => {
          this.updateServicesCount();
        });
        if(queryResult.nextQueryParams.start > -1) {
          return this.getServiceItems(portal, queryResult.nextQueryParams).then(() => {
            return inspectHandle.then();
          });
        } else {
          return inspectHandle.then();
        }
      });
    },

    /**
     *
     * @param serviceItems
     */
    inspectServiceItems: function (serviceItems) {
      serviceItems.forEach((item) => {
        this._processServiceUrl(item.url, [item]);
      });
      return promiseUtils.resolve();
    },

    /**
     *
     * @param portal
     * @param queryParams
     */
    getMapItems: function (portal, queryParams) {
      return portal.queryItems(queryParams).then((queryResult) => {
        const inspectHandle = this.inspectMapItems(queryResult.results).then(() => {
          this.updateServicesCount();
        });
        if(queryResult.nextQueryParams.start > -1) {
          return this.getMapItems(portal, queryResult.nextQueryParams).then(() => {
            return inspectHandle.then();
          });
        } else {
          return inspectHandle.then();
        }
      });
    },

    /**
     *
     * @param mapItems
     */
    inspectMapItems: function (mapItems) {

      const inspectionHandles = mapItems.map((mapItem) => {
        switch (mapItem.type) {
          case "Web Mapping Application":
            return this._processAppItem(mapItem);
          case "Web Map":
          case "Web Scene":
            return this._processMapItem(mapItem);
          default:
            console.warn("Unknown MAP type: ", mapItem.type, " --- ", mapItem.title, mapItem);
            return promiseUtils.resolve();
        }
      });

      return promiseUtils.eachAlways(inspectionHandles).then();
    },

    /**
     *
     * @param mapItem
     * @param relatedItem
     * @private
     */
    _processMapItem: function (mapItem, relatedItem) {

      return mapItem.fetchData().then((data) => {

        // BASEMAP LAYERS //
        const mapHandles = data.baseMap.baseMapLayers.map((baseMapLayer) => {
          if(baseMapLayer.url) {
            if(baseMapLayer.itemId) {
              const layerItem = new PortalItem({ id: baseMapLayer.itemId });
              return layerItem.load().then(() => {
                this._processServiceUrl(baseMapLayer.url, [layerItem, mapItem, relatedItem]);
              });
            } else {
              this._processServiceUrl(baseMapLayer.url, [mapItem, relatedItem]);
              return promiseUtils.resolve();
            }
          } else {
            return promiseUtils.resolve();
          }
        });

        // OPERATIONAL LAYERS //
        const layerHandles = data.operationalLayers.map((operationalLayer) => {
          if(operationalLayer.url) {
            if(operationalLayer.itemId) {
              const layerItem = new PortalItem({ id: operationalLayer.itemId });
              return layerItem.load().then(() => {
                this._processServiceUrl(operationalLayer.url, [layerItem, mapItem, relatedItem]);
              });
            } else {
              this._processServiceUrl(operationalLayer.url, [mapItem, relatedItem]);
              return promiseUtils.resolve();
            }
          } else {
            return promiseUtils.resolve();
          }
        });

        return promiseUtils.eachAlways([...mapHandles, ...layerHandles]).then();
      });

    },

    /**
     *
     * @param appItem
     * @private
     */
    _processAppItem: function (appItem) {
      return appItem.fetchData().then((data) => {
        const mapId = data.values.webmap || data.values.webscene;
        if(mapId) {
          const mapItem = new PortalItem({ id: mapId });
          return mapItem.load().then(() => {
            return this._processMapItem(mapItem, appItem);
          });
        } else {
          if(data.values.story) {
            // STORY MAP //
            const sections = data.values.story.sections || data.values.story.entries;
            if(sections) {
              // SECTIONS OR ENTRIES //
              const sectionHandles = sections.map((section) => {
                if(section.media.type === "webmap") {
                  // WEB MAP //
                  const mapItem = new PortalItem({ id: section.media.webmap.id });
                  return mapItem.load().then(() => {
                    return this._processMapItem(mapItem, appItem);
                  });
                } else {
                  console.info("Story Map Section that is NOT webmap: ", section.media.type);
                  return promiseUtils.resolve();
                }
              });
              return promiseUtils.eachAlways(sectionHandles).then();
            } else {
              console.warn("Found Story Maps app but couldn't track down the map: ", appItem, data);
              return promiseUtils.resolve();
            }
          } else {
            console.warn("Found app but couldn't track down the map: ", appItem, data);
            return promiseUtils.resolve();
          }
        }
      });
    },

    /**
     *
     * @param serviceUrl
     * @param relatedItems
     * @private
     */
    _processServiceUrl: function (serviceUrl, relatedItems) {
      relatedItems.forEach((relatedItem) => {
        if(relatedItem) {
          if(this.serviceURLInfos.has(serviceUrl)) {
            this._updateServiceUrl(serviceUrl, relatedItem);
          } else {
            this._addServiceUrl(serviceUrl, relatedItem);
          }
        }
      });
    },

    /**
     *
     * @param serviceUrl
     * @param item
     */
    _addServiceUrl: function (serviceUrl, item) {

      const urlParser = new URL(serviceUrl);

      const serviceNode = domConstruct.create("tr", { className: "service-node" }, "items-node");

      const urlCell = domConstruct.create("td", {}, serviceNode);
      const urlNode = domConstruct.create("div", { innerHTML: serviceUrl }, urlCell);
      domConstruct.create("a", { className: "icon-ui-link-external icon-ui-blue right", href: serviceUrl, target: "_blank" }, urlNode);
      if(urlParser.protocol !== "https:") {
        domConstruct.create("span", { className: "icon-ui-notice-round icon-ui-red right", title: "Using a non-secure protocol" }, urlNode);
      }

      const relatedCell = domConstruct.create("td", { className: "text-center" }, serviceNode);
      const relatedNode = domConstruct.create("mark", { className: "label", innerHTML: "1" }, relatedCell);

      const serviceUrlInfo = {
        url: serviceUrl,
        serviceNode: serviceNode,
        relatedItems: new Map(),
        relatedNode: relatedNode
      };
      serviceUrlInfo.relatedItems.set(item.id, item);
      this.serviceURLInfos.set(serviceUrl, serviceUrlInfo);

      on(serviceNode, "click", () => {
        query(".service-node").removeClass("selected");
        domClass.add(serviceNode, "selected");
        this.displayRelatedItems(serviceUrlInfo);
      });


      const itemAccess = item.access;
      const serviceUrlInfos = this.serviceInfoByAccess.get(itemAccess);
      serviceUrlInfos.push(serviceUrlInfo);
      this.serviceInfoByAccess.set(itemAccess, serviceUrlInfos);

      const itemOwner = item.owner;
      if(!this.usernames.has(itemOwner)) {
        this.usernames.set(itemOwner, [serviceUrlInfo]);

        const orgUser = this.findOrgUser(itemOwner);
        if(orgUser) {
          //domConstruct.create("option", { value: itemOwner, innerHTML: `${orgUser.fullName} (${itemOwner})` }, "user-select");
        } else {
          domConstruct.create("option", { value: itemOwner, innerHTML: itemOwner }, "user-select");
        }

      } else {
        const serviceUrlInfos = this.usernames.get(itemOwner);
        serviceUrlInfos.push(serviceUrlInfo);
        this.usernames.set(itemOwner, serviceUrlInfos);
      }

      const serverOrigin = urlParser.origin;
      if(!this.serverURLs.has(serverOrigin)) {
        this.serverURLs.set(serverOrigin, [serviceUrlInfo]);
        domConstruct.create("option", { value: serverOrigin, innerHTML: serverOrigin }, "server-select");
      } else {
        const serviceUrlInfos = this.serverURLs.get(serverOrigin);
        serviceUrlInfos.push(serviceUrlInfo);
        this.serverURLs.set(serverOrigin, serviceUrlInfos);
      }

    },

    /**
     *
     * @param serviceUrl
     * @param relatedItem
     */
    _updateServiceUrl: function (serviceUrl, relatedItem) {

      const serviceUrlInfo = this.serviceURLInfos.get(serviceUrl);

      if(!serviceUrlInfo.relatedItems.has(relatedItem.id)) {
        serviceUrlInfo.relatedItems.set(relatedItem.id, relatedItem);
        this.serviceURLInfos.set(serviceUrl, serviceUrlInfo);

        serviceUrlInfo.relatedNode.innerHTML = serviceUrlInfo.relatedItems.size;
        if(serviceUrlInfo.relatedItems.size > 25) {
          domClass.remove(serviceUrlInfo.relatedNode, "label-blue");
          domClass.add(serviceUrlInfo.relatedNode, "label-red");
        } else {
          domClass.add(serviceUrlInfo.relatedNode, "label-blue");
        }
      }
    },

    /**
     *
     * @param serviceUrlInfo
     */
    displayRelatedItems: function (serviceUrlInfo) {

      const relatedItems = Array.from(serviceUrlInfo.relatedItems.values());
      const validRelatedItems = relatedItems.filter(this.filterItem);

      const sortOrder = ["public", "org", "shared", "private"];

      validRelatedItems.sort((a, b) => {
        const accessOrder = (sortOrder.indexOf(a.access) - sortOrder.indexOf(b.access));
        if(accessOrder !== 0) {
          return accessOrder;
        } else {
          return (b.numViews.valueOf() - a.numViews.valueOf());
        }
      });

      this.displayItemsTable(serviceUrlInfo, validRelatedItems);
    },

    /**
     *
     * @param serviceUrlInfo
     * @param displayItems
     */
    displayItemsTable: function (serviceUrlInfo, displayItems) {

      domConstruct.empty("related-node");

      displayItems.forEach((item) => {

        const itemNode = domConstruct.create("tr", { className: "item-node" }, "related-node");

        const titleCell = domConstruct.create("td", { className: "title-cell" }, itemNode);
        domConstruct.create("div", { innerHTML: item.title }, titleCell);

        const typeCell = domConstruct.create("td", {}, itemNode);
        const itemDetailsUrl = `${this.portalUrl}/home/item.html?id=${item.id}`;
        const typeNode = domConstruct.create("a", { className: "", innerHTML: item.displayName, title: item.type, href: itemDetailsUrl, target: "_blank" }, typeCell);
        if(item.iconUrl) {
          domConstruct.create("img", { src: item.iconUrl, className: "margin-right-quarter" }, typeNode, "first");
        }

        const ownerCell = domConstruct.create("td", {}, itemNode);
        const ownerNode = domConstruct.create("div", { className: "text-center", innerHTML: item.owner }, ownerCell);
        const itemOwner = this.findOrgUser(item.owner);
        if(itemOwner) {
          const mailtoTo = `mailto:${itemOwner.email}?cc=${this.portal.user.email}`;
          const mailtoSubject = encodeURIComponent(`'${item.title}' - ${item.id}`);
          const mailtoBody = encodeURIComponent(`${itemOwner.fullName.split(" ")[0]},\n\tI need your assistance with the following item:\n\nTITLE:\t${item.title}\nTYPE:\t${item.type}\nID:\t${item.id}\nLINK:\t${itemDetailsUrl}\n\nCONTEXT: ${serviceUrlInfo.url}\n\nThank you,\n\n${this.portal.user.fullName}`);
          const mailtoLink = `${mailtoTo}&subject=${mailtoSubject}&body=${mailtoBody}`;
          domConstruct.create("a", { className: "icon-ui-contact right", href: mailtoLink, title: "Email owner about this item..." }, ownerNode);
        }

        const accessCell = domConstruct.create("td", {}, itemNode);
        const accessNode = domConstruct.create("div", { className: "text-center", innerHTML: item.access }, accessCell);

        const viewsCell = domConstruct.create("td", {}, itemNode);
        const viewsNode = domConstruct.create("div", { className: "text-right", innerHTML: number.format(item.numViews) }, viewsCell);

        const updatedCell = domConstruct.create("td", {}, itemNode);
        const updatedNode = domConstruct.create("div", { className: "text-right", innerHTML: locale.format(item.modified, { selector: "date", datePattern: "MMMM dd, yyyy" }) }, updatedCell);

      });

    },


    /**
     *
     */
    /*initializeGroupContent: function () {

      if(this.portal.user) {

        this.portal.user.fetchGroups().then((portalGroups) => {

          const groupsById = portalGroups.reduce((infos, portalGroup, portalGroupIndex) => {
            if(portalGroup.owner === this.portal.user.username) {
              infos.set(portalGroup.id, portalGroup);
              domConstruct.create("input", { className: "group-input", type: "checkbox", id: portalGroup.id }, domConstruct.create("label", { className: "esri-interactive", innerHTML: portalGroup.title }, "groups-set"));
            }
            return infos;
          }, new Map());

          query(".group-input")[0].checked = true;
          this.analyzeCurrentGroupContent = () => {
            this._clearUI();
            query(".group-input:checked").forEach((node) => {
              this.analyzeGroupContent(groupsById.get(node.id));
            });
          };
          query(".group-input").on("change", this.analyzeCurrentGroupContent);
          this.analyzeCurrentGroupContent();

        });

      }
    },*/

    /**
     *
     * @param portalGroup
     */
    /*displayGroupDetails: function (portalGroup) {
      domConstruct.empty("group-details");
      const thumbNode = domConstruct.create("span", { className: "column-2 text-center" }, "group-details");
      domConstruct.create("img", { src: portalGroup.thumbnailUrl || "./images/no_preview.gif" }, thumbNode);
      domConstruct.create("div", { className: "column-3 inline", innerHTML: `Owner: ${portalGroup.owner}` }, "group-details");
      domConstruct.create("div", { className: "column-3 inline", innerHTML: `Access: ${portalGroup.access}` }, "group-details");
      domConstruct.create("div", { className: "column-15 inline avenir-bold", innerHTML: portalGroup.snippet }, "group-details");
    },*/

    /**
     *
     */
    /*initializeFolderContent: function () {

      if(this.portal.user) {

        this.portal.user.fetchFolders().then((portalFolders) => {

          const foldersById = portalFolders.reduce((infos, portalFolder) => {
            infos.set(portalFolder.id, portalFolder);
            domConstruct.create("input", { className: "folder-input", type: "checkbox", id: portalFolder.id }, domConstruct.create("label", { className: "esri-interactive", innerHTML: portalFolder.title }, "folders-set"));
            return infos;
          }, new Map());

          query(".folder-input")[0].checked = true;
          this.analyzeCurrentFolderContent = () => {
            this._clearUI();
            query(".folder-input:checked").forEach((node) => {
              this.analyzeFolderContent(foldersById.get(node.id));
            });
          };
          query(".folder-input").on("change", this.analyzeCurrentFolderContent);

        });
      }

    },*/

    /**
     *
     * @param portalFolder
     */
    /*analyzeFolderContent: function (portalFolder) {
      const params = { num: 100, folder: portalFolder };
      this.portal.user.fetchItems(params).then((queryResults) => {
        portalFolder.type = "Folder";
        portalFolder.isContentSource = true;
        portalFolder.size = 15;
        portalFolder.order = 5;
        this.analyzeContent(portalFolder, queryResults.items).then(() => {
          this.updateGraph(this.graph);
        });
      });
    },*/

    /**
     *
     * @param portalGroup
     */
    /*analyzeGroupContent: function (portalGroup) {
      const params = new PortalQueryParams({ num: 100 });
      portalGroup.queryItems(params).then((queryResults) => {
        portalGroup.type = "Group";
        portalGroup.isContentSource = true;
        portalGroup.size = 15;
        portalGroup.order = 5;
        this.analyzeContent(portalGroup, queryResults.results).then(() => {
          this.updateGraph(this.graph);
        });
      });
    },*/

    /**
     *
     * @param source
     * @param items
     */
    /*analyzeContent: function (source, items) {

      this.graph.nodes.push(source);

      const analyzeHandles = items.map((item) => {
        let analyzePromise = null;

        switch (true) {
          case (item.type === "Web Map") || (item.type === "Web Scene"):
            analyzePromise = item.load().then(() => {
              return this.displayWebMapItem(source, item);
            });
            //analyzePromise = this.displayWebMapItem(source, item);
            break;
          case (item.isLayer):
            analyzePromise = item.load().then(() => {
              return this.displayLayerItem(source, item);
            });
            //analyzePromise = this.displayLayerItem(source, item);
            break;
          default:
            analyzePromise = promiseUtils.resolve();
        }

        return analyzePromise;
      });

      return promiseUtils.eachAlways(analyzeHandles).then();

    },*/

    /**
     *
     * @param source
     * @param mapItem
     */
    /*displayWebMapItem: function (source, mapItem) {
      //console.info(item);

      /!*domConstruct.create("div", {
        className: "webmap-info",
        innerHTML: mapItem.title
      }, "items-list-webmaps");*!/

      return mapItem.fetchData().then((data) => {
        //console.info(item.title, data);
        const mapHandles = data.baseMap.baseMapLayers.map((baseMapLayer) => {
          if(baseMapLayer.url) {
            if(baseMapLayer.itemId) {
              const layerItem = new PortalItem({ id: baseMapLayer.itemId });
              return layerItem.load().then(() => {
                this.addGraphRelationships(source, baseMapLayer.url, layerItem, mapItem);
              });
            } else {
              this.addGraphRelationships(source, baseMapLayer.url, null, mapItem);
              return promiseUtils.resolve();
            }
          } else {
            return promiseUtils.resolve();
          }
        });
        const layerHandles = data.operationalLayers.map((operationalLayer) => {
          if(operationalLayer.url) {
            if(operationalLayer.itemId) {
              const layerItem = new PortalItem({ id: operationalLayer.itemId });
              return layerItem.load().then(() => {
                this.addGraphRelationships(source, operationalLayer.url, layerItem, mapItem);
              });
            } else {
              this.addGraphRelationships(source, operationalLayer.url, null, mapItem);
              return promiseUtils.resolve();
            }
          } else {
            return promiseUtils.resolve();
          }
        });

        return promiseUtils.eachAlways([...mapHandles, ...layerHandles]).then();
      });

    },*/

    /**
     *
     * @param source
     * @param layerItem
     */
    /*displayLayerItem: function (source, layerItem) {
      /!*domConstruct.create("div", {
        className: "layer-info",
        innerHTML: layerItem.title
      }, "items-list-layers");*!/
      if(layerItem.url) {
        this.addGraphRelationships(source, layerItem.url, layerItem);
      }
      return promiseUtils.resolve();
    },*/

    /**
     *
     * @param source
     * @param url
     * @param layerItem
     * @param mapItem
     */
    /*displayServiceInfo: function (source, url, layerItem, mapItem) {
      const serviceNode = domConstruct.create("div", { className: "service-info" }, "items-list-services");
      if(mapItem) {
        domConstruct.create("div", { className: "avenir-demi", innerHTML: `${mapItem.type}: ${mapItem.title}` }, serviceNode);
      }
      if(layerItem) {
        domConstruct.create("div", { className: "avenir-demi", innerHTML: `${layerItem.type}: ${layerItem.title}` }, serviceNode);
      }
      domConstruct.create("div", { innerHTML: url }, serviceNode);
      this.addGraphRelationships(source, url, layerItem, mapItem);
    },*/

    /**
     *
     * @param id
     * @returns {number}
     */
    /*getNodeIndexById: function (id) {
      return this.graph.nodes.findIndex((nodeInfo) => {
        return (nodeInfo.id === id);
      });
    },*/

    /**
     *
     * @param parentNodeIndex
     * @param item
     * @param size
     * @param sourceIndex
     * @returns {number}
     * @private
     */
    /*addGraphItem: function (parentNodeIndex, item, size, sourceIndex) {

      const isMap = (item.type === "Web Map") || (item.type === "Web Scene");

      let nodeIndex = this.getNodeIndexById(item.id);
      if(nodeIndex === -1) {
        nodeIndex = this.graph.nodes.push({
          id: item.id,
          url: item.url || item.userItemUrl,
          title: item.title,
          access: item.access,
          type: item.type,
          isPortalItem: (item.isLayer || isMap),
          order: isMap ? 4 : 3,
          iconUrl: item.iconUrl,
          owner: item.owner,
          size: size
        });
        --nodeIndex;
      }
      this.graph.links.push({ source: nodeIndex, target: parentNodeIndex, "bond": 1 });

      if(sourceIndex != null) {
        this.graph.links.push({ source: sourceIndex, target: nodeIndex, "bond": 2 });
      }

      return nodeIndex;
    },*/

    /**
     *
     * @param source
     * @param url
     * @param layerItem
     * @param mapItem
     */
    /*addGraphRelationships: function (source, url, layerItem, mapItem) {

      const sourceIndex = this.getNodeIndexById(source.id);

      const urlParser = new URL(url);

      const serverOrigin = urlParser.origin;
      let serverNodeIndex = this.getNodeIndexById(serverOrigin);
      if(serverNodeIndex === -1) {
        serverNodeIndex = this.graph.nodes.push({ id: serverOrigin, url: serverOrigin, title: serverOrigin, size: 4, type: "Server", order: 1 });
        --serverNodeIndex;
      }

      let serviceNodeIndex = this.getNodeIndexById(url);
      if(serviceNodeIndex === -1) {

        const serviceName = urlParser.pathname;
        const restServices = "/rest/services/";
        const serviceTitle = serviceName.slice(serviceName.indexOf(restServices) + restServices.length);

        serviceNodeIndex = this.graph.nodes.push({ id: url, url: url, title: serviceTitle, size: 5, type: "Service", order: 2 });
        --serviceNodeIndex;
        this.graph.links.push({ source: serviceNodeIndex, target: serverNodeIndex, "bond": 1 });
      }

      if(layerItem && mapItem) {
        const layerNodeIndex = this.addGraphItem(serviceNodeIndex, layerItem, 7);
        this.addGraphItem(layerNodeIndex, mapItem, 10, sourceIndex);
      } else {
        if(layerItem) {
          this.addGraphItem(serviceNodeIndex, layerItem, 7, sourceIndex);
        } else {
          if(mapItem) {
            this.addGraphItem(serviceNodeIndex, mapItem, 10, sourceIndex);
          } else {
            console.warn("We should NEVER get here...");
          }
        }
      }
    },*/

    /**
     *  https://github.com/d3/d3-3.x-api-reference/blob/master/Force-Layout.md
     *
     *  https://bl.ocks.org/mbostock
     *
     *  https://gist.github.com/sathomas/1ca23ee9588580d768aa
     *  http://www.coppelia.io/2014/07/an-a-to-z-of-extra-features-for-the-d3-force-layout/
     *  http://mbostock.github.io/d3/talk/20111116/force-collapsible.html
     *  http://mbostock.github.io/d3/talk/20111018/tree.html
     *  https://bl.ocks.org/jpurma/6dd2081cf25a5d2dfcdcab1a4868f237
     *  https://bl.ocks.org/mbostock/1093130
     */
    /*initLinks: function (portal) {

      const nodeGeom = domGeom.getContentBox("links-node");
      const width = nodeGeom.w;
      const height = nodeGeom.h;

      const color = d3.scale.category20();
      const radius = d3.scale.sqrt().range([0, 6]);

      const svg = d3.select("#links-node").append("svg").attr("width", width).attr("height", height);

      const force = d3.layout.force().size([width, height]).charge(-300).linkDistance(function (d) {
        return (radius(d.source.order) + radius(d.target.order) * 5) + 20;
      });//.gravity(0.1)

      this.clearGraph = () => {
        svg.selectAll('*').remove();
        query("#graph-legend").empty();
      };

      this.updateGraph = (graph) => {
        svg.selectAll('*').remove();

        force.nodes(graph.nodes).links(graph.links).on("tick", tick).start();

        svg.append("defs").selectAll("marker").data(["suit"]).enter().append("marker").attr("id", function (d) {
          return d;
        }).attr("viewBox", "0 -5 10 10").attr("refX", 25).attr("refY", 0).attr("markerWidth", 6).attr("markerHeight", 6).attr("orient", "auto").append("path").attr("d", "M0,-5L10,0L0,5 L10,0 L0, -5").style("stroke", "#fff").style("opacity", "0.6");

        let link = svg.selectAll(".link").data(graph.links).enter().append("g").attr("class", "link").style("marker-end", "url(#suit)");

        link.append("line").style("stroke-width", function (d) {
          return "2px";
        });
        link.filter(function (d) {
          return d.bond > 1;
        }).append("line").attr("class", "separator");


        const node = svg.selectAll(".node").data(graph.nodes).enter().append("g").attr("class", "node").on("mouseover", mouseover).on("mouseout", mouseout).on('dblclick', connectedNodes).call(force.drag);


        const typeColors = new Map();
        node.append("circle").attr("r", function (d) {
          return radius(d.size);
        }).style("fill", function (d) {
          if(d.iconUrl) {
            domConstruct.create("img", { src: d.iconUrl, className: "margin-right-quarter" });
          }
          const itemColor = color(d.type);
          if(!typeColors.has(d.type)) {
            typeColors.set(d.type, { color: itemColor, iconUrl: d.iconUrl });
          }
          return itemColor;
        }).style("stroke", function (d) {
          const defaultStoke = "#0079c1";
          if(d.type === "Server") {
            const serverUrl = new URL(d.url);
            return (serverUrl.protocol === "https:") ? defaultStoke : "red";
          } else {
            return defaultStoke;
          }
        });
        this.buildGraphLegend(typeColors);

        node.filter(function (d) {
          return (d.iconUrl != null);
        }).append("image").attr("x", -8).attr("y", -8).attr("xlink:href", function (d) {
          return d.iconUrl;
        });

        node.append("text").attr("dy", function (d) {
          return d.iconUrl ? "-12px" : "0"; // "0.35em";
        }).attr("text-anchor", "middle").text(function (d) {
          return d.title;
        });

        function tick(e) {
          const k = 6 * e.alpha;

          // Push sources up and targets down to form a weak tree.
          /!*link.each(function (d) {
            d.source.y -= k;
            d.target.y += k;
          }).attr("x1", function (d) {
            return d.source.x;
          }).attr("y1", function (d) {
            return d.source.y;
          }).attr("x2", function (d) {
            return d.target.x;
          }).attr("y2", function (d) {
            return d.target.y;
          });
          node.attr("cx", function (d) {
            return d.x;
          }).attr("cy", function (d) {
            return d.y;
          });*!/


          link.selectAll("line").attr("x1", function (d) {
            return d.source.x;
          }).attr("y1", function (d) {
            return d.source.y;
          }).attr("x2", function (d) {
            return d.target.x;
          }).attr("y2", function (d) {
            return d.target.y;
          });
          node.attr("transform", function (d) {
            return "translate(" + d.x + "," + d.y + ")";
          });

        }

        function mouseover() {
          // d3.select(this).select("text").transition().duration(750).style("opacity", 1).style("font-size", "17pt");
        }

        function mouseout() {
          // d3.select(this).select("text").transition().duration(250).style("opacity", 0.65).style("font-size", "9pt");
        }

        let toggle = 0;
        const linkedByIndex = {};
        for (i = 0; i < graph.nodes.length; i++) {
          linkedByIndex[i + "," + i] = 1;
        }

        graph.links.forEach(function (d) {
          linkedByIndex[d.source.index + "," + d.target.index] = 1;
        });

        function neighboring(a, b) {
          return linkedByIndex[a.index + "," + b.index];
        }

        function connectedNodes() {
          if(toggle === 0) {
            const d = d3.select(this).node().__data__;

            const itemLineageIDs = displayTraceItems(d);
            //createSelectionGraph(itemLineageIDs);

            node.style("opacity", function (o) {
              return itemLineageIDs.includes(o.id) ? 1 : 0.1;
            });
            node.selectAll("text").style("opacity", function (o) {
              return itemLineageIDs.includes(o.id) ? 1 : 0.1;
            });
            link.style("opacity", function (o) {
              return (itemLineageIDs.includes(o.source.id) && itemLineageIDs.includes(o.target.id)) ? 1 : 0.1;
            });
            toggle = 1;
          } else {
            displayTraceItems();
            node.selectAll("text").style("opacity", 0.65);
            node.style("opacity", 1);
            link.style("opacity", 1);
            toggle = 0;
          }
        }

        /!**
         * https://bl.ocks.org/mbostock/2949981
         * http://bl.ocks.org/trembl/9263485
         *
         * @param itemLineageIDs
         *!/
        function createSelectionGraph(itemLineageIDs) {

          const selectedGraph = {
            nodes: graph.nodes.filter((nodeInfo) => {
              return itemLineageIDs.includes(nodeInfo.id);
            }),
            links: graph.links.filter((linkInfo) => {
              return (itemLineageIDs.includes(linkInfo.source.id) && itemLineageIDs.includes(linkInfo.target.id));
            })
          };


          query("#tree-node").empty();
          const treeNodeGeom = domGeom.getContentBox("tree-node");
          const margin = { top: 20, right: 20, bottom: 20, left: 20 };
          const treeWidth = treeNodeGeom.w - margin.left - margin.right;
          const treeHeight = treeNodeGeom.h - margin.top - margin.bottom;

          const tree = d3.layout.tree().size([treeHeight, treeWidth]);
          const diagonal = d3.svg.diagonal().projection(function (d) {
            return [d.y, d.x];
          });

          const treeSvg = d3.select("#tree-node").append("svg")
              .attr("width", treeWidth + margin.left + margin.right)
              .attr("height", treeHeight + margin.top + margin.bottom)
              .append("g")
              .attr("transform", "translate(" + margin.left + "," + margin.top + ")");

          //const nodesByName = {};
          //function nodeByName(item) {
          //  return nodesByName[item.id] || (nodesByName[item.id] = item);
          //}

          const treeLinks = selectedGraph.links;
          treeLinks.forEach(function (link) {
            //const parent = link.source = nodeByName(link.source);
            //const child = link.target = nodeByName(link.target);
            //if(parent.children) parent.children.push(child);
            //else parent.children = [child];
            if(link.source.children) {
              link.source.children.push(link.target);
            } else {
              link.source.children = [link.target];
            }
          });

          const treeNodes = tree.nodes(selectedGraph.nodes);

          treeSvg.selectAll(".link").data(treeLinks).enter().append("path").attr("class", "tree-link").attr("d", diagonal);

          treeSvg.selectAll(".node").data(treeNodes).enter().append("circle").attr("class", "tree-node").attr("r", 5).attr("cx", function (d) {
            return d.y;
          }).attr("cy", function (d) {
            return d.x;
          });

        }

        function displayTraceItems(item) {
          query("#lineage-node").empty();
          if(item) {
            const itemLineage = _getItemLineage(item);

            itemLineage.sort((a, b) => {
              return (b.order - a.order);
            });

            return itemLineage.map((item) => {
              displayItemInfo(item);
              return item.id;
            });
          } else {
            return null;
          }
        }

        function _getItemLineage(item) {
          item.trace = "focus";
          const sourceItems = _trace(item, "target");
          const targetItems = _trace(item, "source").reverse();
          return [...sourceItems, item, ...targetItems];
        }

        function _trace(sourceItem, direction) {
          const tracedItems = new Map();

          function __recurse(item) {
            const links = _getLinksById(item.id, direction);
            if(links.length > 0) {
              links.forEach((link) => {
                __recurse(link[direction !== "source" ? "source" : "target"]);
              });
            }
            if((item.id !== sourceItem.id) && (!tracedItems.has(item.id))) {
              item.trace = direction;
              tracedItems.set(item.id, item);
            }
          }

          __recurse(sourceItem);

          return Array.from(tracedItems.values());
        }

        function _getLinksById(id, direction) {
          return graph.links.filter((linkInfo) => {
            return (linkInfo[direction].id === id);
          });
        }


      };
    },*/

    /**
     *
     * @param colorInfos
     */
    /*buildGraphLegend: function (colorInfos) {
      query("#graph-legend").empty();

      colorInfos.forEach((colorInfo, type) => {

        const legendItemNode = domConstruct.create("div", { className: "graph-legend-item" }, "graph-legend");
        domConstruct.create("span", { className: "inline-block graph-legend-color", style: `background:${colorInfo.color};` }, legendItemNode);
        if(colorInfo.iconUrl) {
          domConstruct.create("img", { src: colorInfo.iconUrl, className: "margin-right-quarter" }, legendItemNode);
        }
        domConstruct.create("span", { className: "inline-block text-blue font-size--2", innerHTML: type }, legendItemNode);

      });

    }*/

  })
      ;
});

