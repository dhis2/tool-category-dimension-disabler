# Category dimension disabler

## License
© Copyright 2024 University of Oslo

## Introduction

 Categories can be used in the data visualization tools and data set reports to aggregate data. They are particularly useful to generate subtotals for a category used in a category combination. For instance, if you have a category combination called "Age/Sex" which consists of two categories, you can easily generate the subtotals for the for the category options in Age (e.g. Male and Female) and Age (&lt;15 and &gt;15) when 
 these dimensions are enabled. When enabled as a dimension, categories will appear in the user interface
 of visualization tools, where they can be used.

 In many cases, it has been observed that categories which may be used for data collection, are not
 necessarily used for analysis. There can be many reasons for this. Category totals are also easily
 calculated with indicators, so perhaps the subtotals are calculated that way. In other cases, categories
 may have been used at one point in time in the system, but have been deprecated in favor of new ones.

 Categories which are not actively used for analysis should be considered to be disabled as a dimension.
 The reason for this is that each time a category is enabled as a dimension, a column is created in the
 DHIS2 analytics tables. The creation and indexing of these columns requires computation time and consumes
 disk space. Thus, in cases when categories are not used for analytical purposes, it may be wise to 
 consider to disable them. Categories are easily re-enabled as dimensions.

 When considering to disable a category as a dimension, you should determine what the impact will be.  Any existing favorites which use this dimension will no longer work and subtotals in the data set reports (when used with section forms) will also no longer work. The tradeoff here could be shorter analytics processing time and reduced disk consumption. 

 The app will need to install an SQL view in order to provide the necessary data. A button in the app will allow you to remove this view called "Category dimension usage". The view will be set to public read, so if you need to change the permissions of this view, you can adjust this with the maintenance app yourself.

As always, you should always changes to your system in a testing environment!
## Getting started

### Install dependencies
To install app dependencies:

```
yarn install
```

### Compile to zip
To compile the app to a .zip file that can be installed in DHIS2:

```
yarn run zip
```

### Start dev server
To start the webpack development server:

```
yarn start
```

By default, webpack will start on port 8081, and assumes DHIS2 is running on 
http://localhost:8080/dhis with `admin:district` as the user and password.

A different DHIS2 instance can be used to develop against by adding a `d2auth.json` file like this:

```
{
    "baseUrl": "localhost:9000/dev",
    "username": "john_doe",
    "password": "District1!"
}
```
