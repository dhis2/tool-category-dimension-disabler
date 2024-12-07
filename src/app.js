"use strict";

//JS
import { d2Delete, d2Get, d2Patch, d2PostJson } from "./js/d2api.js";

//CSS
import "./css/header.css";
import "./css/style.css";
import "datatables.net-dt/css/dataTables.dataTables.css";

//Other dependencies
import $ from "jquery";
import DataTable from "datatables.net";
window.DataTable = DataTable;

const sql_view_41 = {
    "name": "Category dimension usage",
    "id": "GOLswS44mh8",
    "sqlQuery": "  WITH summary as (\nSELECT z.uid,z.name,COALESCE(rs.count,0) as count FROM category z\nLEFT JOIN (\nSELECT y.categoryid, COUNT(*) FROM datastatisticsevent x\nINNER JOIN (\nSELECT DISTINCT b.categoryid,c.uid\nfrom eventvisualization_categorydimensions a\nJOIN categorydimension b on a.categorydimensionid = b.categorydimensionid\nJOIN eventvisualization c on a.eventvisualizationid = c.eventvisualizationid\nUNION\nSELECT DISTINCT b.categoryid,c.uid\nfrom mapview_categorydimensions a\nJOIN categorydimension b on a.categorydimensionid = b.categorydimensionid\nJOIN mapview c on a.mapviewid = c.mapviewid\nUNION\nSELECT DISTINCT b.categoryid,c.uid\nfrom visualization_categorydimensions a\nJOIN categorydimension b on a.categorydimensionid = b.categorydimensionid\nJOIN visualization c on a.visualizationid = c.visualizationid\n) y on x.favoriteuid = y.uid\nWHERE AGE(NOW(),timestamp) < '12 month'::interval\nGROUP BY categoryid ) rs on z.categoryid = rs.categoryid\nWHERE z.datadimension = TRUE\n  ),\n  totals as (\n    SELECT SUM(count) as total_count from summary\n  ),\n  total_favorite_views as (\n    SELECT COUNT(*) as count FROM datastatisticsevent\n    WHERE AGE(NOW(),timestamp) < '12 month'::interval\n    AND eventtype in ('EVENT_CHART_VIEW','MAP_VIEW','VISUALIZATION_VIEW')\n  )\nSELECT a.uid,a.name,a.count, \nCOALESCE(a.count::double precision / NULLIF(b.total_count,0) * 100.0,0) as percent,\nCOALESCE(a.count::double precision / NULLIF(c.count,0) * 100.0,0) as percent_of_views\nfrom summary a \nCROSS JOIN totals b\nCROSS JOIN total_favorite_views c\nORDER BY count DESC\n",
    "type": "QUERY",
    "cacheStrategy": "NO_CACHE",
    "sharing": {
        "public": "rwrw----"
    }
};

const sql_view_40 = {
    "name": "Category dimension usage",
    "id": "GOLswS44mh8",
    "sqlQuery": "  WITH summary as (\nSELECT z.uid,z.name,COALESCE(rs.count,0) as count FROM dataelementcategory z\nLEFT JOIN (\nSELECT y.categoryid, COUNT(*) FROM datastatisticsevent x\nINNER JOIN (\nSELECT DISTINCT b.categoryid,c.uid\nfrom eventvisualization_categorydimensions a\nJOIN categorydimension b on a.categorydimensionid = b.categorydimensionid\nJOIN eventvisualization c on a.eventvisualizationid = c.eventvisualizationid\nUNION\nSELECT DISTINCT b.categoryid,c.uid\nfrom mapview_categorydimensions a\nJOIN categorydimension b on a.categorydimensionid = b.categorydimensionid\nJOIN mapview c on a.mapviewid = c.mapviewid\nUNION\nSELECT DISTINCT b.categoryid,c.uid\nfrom visualization_categorydimensions a\nJOIN categorydimension b on a.categorydimensionid = b.categorydimensionid\nJOIN visualization c on a.visualizationid = c.visualizationid\n) y on x.favoriteuid = y.uid\nWHERE AGE(NOW(),timestamp) < '12 month'::interval\nGROUP BY categoryid ) rs on z.categoryid = rs.categoryid\nWHERE z.datadimension = TRUE\n  ),\n  totals as (\n    SELECT SUM(count) as total_count from summary\n  ),\n  total_favorite_views as (\n    SELECT COUNT(*) as count FROM datastatisticsevent\n    WHERE AGE(NOW(),timestamp) < '12 month'::interval\n    AND eventtype in ('EVENT_CHART_VIEW','MAP_VIEW','VISUALIZATION_VIEW')\n  )\nSELECT a.uid,a.name,a.count, \nCOALESCE(a.count::double precision / NULLIF(b.total_count,0) * 100.0,0) as percent,\nCOALESCE(a.count::double precision / NULLIF(c.count,0) * 100.0,0) as percent_of_views\nfrom summary a \nCROSS JOIN totals b\nCROSS JOIN total_favorite_views c\nORDER BY count DESC\n" ,
    "type": "QUERY",
    "cacheStrategy": "NO_CACHE",
    "sharing": {
        "public": "rwrw----"
    }
};

function getSqlQueryFromVersion(version) {
    if (version < 41)
        return sql_view_40;
    else
        return sql_view_41;
}

async function checkVersion() {
    try {
        const data = await d2Get("/api/system/info");
        const version = data.version.split(".")[1];
        console.log("DHIS2 version:", version);
        return version;
    } catch (error) {
        console.error("Error checking DHIS2 version:", error);
        return false;
    }
}

function updateDataTable() {
    const uid = sql_view_41.id;
    $("#detailsReport").html("<img src='ajax-loader.gif' alt='Loading...'>");
    const loadingSpinner = `
    <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <style>
            .spinner_I8Q1 { animation: spinner_qhi1 .75s linear infinite; }
            .spinner_vrS7 { animation-delay: -.375s; }
            @keyframes spinner_qhi1 {
                0%, 100% { r: 1.5px; }
                50% { r: 3px; }
            }
        </style>
        <circle class="spinner_I8Q1" cx="4" cy="12" r="1.5"/>
        <circle class="spinner_I8Q1 spinner_vrS7" cx="12" cy="12" r="3"/>
        <circle class="spinner_I8Q1" cx="20" cy="12" r="1.5"/>
    </svg>
    `;
    $("#detailsReport").html(loadingSpinner);
    d2Get("/api/sqlViews/" + uid + "/data.json")
        .then((data) => {
            let table = formatData(data);
            $("#detailsReport").html(table);
            new DataTable("#detailsTable", { "paging": true, "searching": true, order: [[2, "desc"]] });
        })
        .catch((error) => {
            console.error("Error:", error);
            $("#detailsReport").html("<p>Error loading data</p>");
        });
}

function formatData(data)  {
    //Print out all of the name of the data objects
    //If there are no rows, return an empty table

    let html = "<table id='detailsTable' class='display' style='width:100%'><thead><tr>";
    const  col_names = ["UID",  "Category", "Views", "% of category views", "% of views","Disable"];
    col_names.forEach((col_name) => {
        html += "<th>" + col_name + "</th>";
    });
    html += "</tr></thead><tbody>";
    if (data.listGrid.rows.length > 0) {
        data.listGrid.rows.forEach((row) => {
            html += "<tr>";
            const rowData = {
                uid: row[0],
                category: row[1],
                views: row[2],
                percent_of_category_views: row[3],
                percent_of_views: row[4]
            };

            html += "<td>" + rowData.uid + "</td>";
            html += "<td>" + rowData.category + "</td>";
            html += "<td>" + rowData.views + "</td>";
            html += "<td>" + rowData.percent_of_category_views + "%</td>";
            html += "<td>" + rowData.percent_of_views + "%</td>";
            //UID is in the first column
            html += "<td><button onclick='disableCategoryDataDimension(\"" + row[0] + "\")'>Disable</button></td>";
            html += "</tr>";
        });
    }
    html += "</tbody></table>";
    return html;
}

function disableCategoryDataDimension(uid) {
    const pl = [
        {"op": "add", "path": "/dataDimension", "value": "false"}
    ] ;
    if (confirm("Are you sure you want to disable this category?")) {
        d2Patch("/api/categories/" + uid, pl)
            .then((response) => {
                alert("Category disabled");
                updateDataTable();
            })
            .catch((error) => {
                console.error("Error:", error);
            });
    }
}

function createViewIfNotExists(sql_view) {
    const uid = sql_view.id;
    d2Get("/api/sqlViews/" + uid)
        .then((response) => {
            console.log("SQL view exists:", response);
        })
        .catch((error) => {
            if (confirm("The required SQL view does not exist. Do you want to create it?")) {
                d2PostJson("/api/sqlViews", sql_view)
                    .then(() => {
                        alert("SQL view created successfully.");
                        updateDataTable();
                    })
                    .catch((error) => {
                        console.error("Error creating SQL view:", error);
                    });
            }
        });
}


async function initialize() {
    const version = await checkVersion();
    const sql_view = getSqlQueryFromVersion(version);
    console.log("SQL view:", sql_view);
    createViewIfNotExists(sql_view);
    updateDataTable();
}

function removeSQLView() {
    const uid = sql_view_41.id;
    if (confirm("Are you sure you want to delete the SQL view?")) {
        d2Delete("/api/sqlViews/" + uid)
            .then((response) => {
                alert("SQL view deleted");
            })
            .catch((error) => {
                console.error("Error:", error);
            });
    }
}
window.removeSQLView = removeSQLView;
window.disableCategoryDataDimension = disableCategoryDataDimension;
initialize();