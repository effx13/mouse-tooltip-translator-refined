# python -m pip install --pre googletrans
#  pip install "httpx>=0.27.2,<1.0"
# pip install tqdm
# python ./scripts/insertLocale.py

import os
import json
from googletrans import Translator
from tqdm import tqdm
import time

translator = Translator()


appName = "Mouse Tooltip Translator Refined"
appDesc = "Hover or select text to translate it in a tooltip. Also works in PDF and ebook files."

localeList = ["en", "ko", "ja", "zh_CN", "zh_TW", "es", "fr", "de", "pt_BR", "ru"]
translateLangCodeDict = {"zh_CN": "zh-CN", "zh_TW": "zh-TW"}
i18List = [
    "MAIN",
    "Translate When",
    "Translate From",
    "Translate Into",
    "Mouseover Text Type",
    "Translate Into 2",
    "Writing Language",
    "Reverse Translate Language",
    "ENGINE",
    "Engines are tried from top to bottom and the first answer is used",
    "Ready",
    "Uses API key",
    "Needs API key",
    "Needs setup",
    "Experimental",
    "Enable",
    "Move up",
    "Move down",
    "Press Alt and arrow keys to reorder",
    "Test",
    "Testing",
    "Test succeeded",
    "Test failed",
    "Get a key",
    "API Key",
    "Region",
    "Client ID",
    "Client Secret",
    "Server URL",
    "Browser built in translator",
    "OpenAI compatible LLM",
    "LLM Provider",
    "LLM Api Endpoint",
    "LLM Api Key",
    "LLM Model",
    "Translation Cache",
    "Clear translation cache",
    "Translation cache cleared",
    "KEYBOARD",
    "Show Tooltip When",
    "Translate Writing When",
    "Ignore AltGr Modifier",
    "Translate Page When",
    "Mouseover Text Type Key Hold",
    "Secondary Language When",
    "Swap Key Toggle Mode",
    "Toggle Extension When",
    "GRAPHIC",
    "Tooltip Font Size",
    "Tooltip Font Family",
    "Tooltip Width",
    "Tooltip Distance",
    "Tooltip Animation",
    "Tooltip Disappear Duration",
    "Tooltip Position",
    "Tooltip Placement",
    "Above",
    "Below",
    "Tooltip Text Align",
    "Tooltip Background Blur",
    "Mouseover Highlight Text",
    "Tooltip Font Color",
    "Tooltip Background Color",
    "Tooltip Border Color",
    "Mouseover Text Highlight Color",
    "Ebook Theme",
    "Setting Compact mode",
    "EXCLUDE",
    "Exclude Language",
    "Website Filter Mode",
    "Exclude Website",
    "Whitelist Website",
    "Website Target Language",
    "Block Current Site",
    "Allow Current Site",
    "ADVANCED",
    "UI Language",
    "Detect PDF",
    "Mouseover Text Type 2",
    "Show Tooltip While Typing",
    "Tooltip Info Source Text",
    "Translate Exclude Regex",
    "Tooltip Info Source Language",
    "Tooltip Info Transliteration",
    "Tooltip Show Delay",
    "Tooltip Word Dictionary",
    "Tooltip Word Dictionary Source",
    "BACKUP",
    "Sync Setting",
    "Import Setting",
    "Export Setting",
    "Reset Setting",
    "How to use",
    "Check how to use this extension",
    "PDF Viewer",
    "Translate local PDF file",
    "Ebook Reader",
    "Translate local ebook file",
    "Source code",
    "Check source code in github",
    "Privacy Policy",
    "User privacy policy",
    "Auto",
    "None",
    "Select",
    "Mouseover",
    "Mouseover n Select",
    "Follow",
    "Fixed",
    "Top Right",
    "Fade",
    "Scale",
    "Shift away",
    "Shift toward",
    "Perspective",
    "Word",
    "Sentence",
    "Container",
    "Both",
    "Blacklist",
    "Whitelist",
    "Always",
    "Center",
    "Left",
    "Right",
    "Justify",
    "Light",
    "Dark",
    "Default",
    "Ctrl Left",
    "Ctrl Right",
    "Alt Left",
    "Alt Right",
    "Shift Left",
    "Shift Right",
    "Meta Left",
    "Meta Right",
    "Click Left",
    "Click Middle",
    "Click Right",
    "About",
    "Translator",
    "Wiktionary",
    "Custom",
    "Back",
    "Cancel",
    "Remove",
    "Alpha",
    "Fetch models from endpoint",
    "No models returned by endpoint",
    "API endpoint is empty",
    "Failed to fetch LLM models",
    "Open this popup on a website to use this button",
    "Import failed",
    "Copy PDF URL",
    "Copied",
    "Copy failed",
    "Allow access to file URLs to open local PDF files",
    "Open File",
    "Previous Page",
    "Next Page",
    "Table of Contents",
    "Drop an ebook file here or open one",
    "Could not open this file",
    "Untitled",
    "Page",
    "Zoom out",
    "Zoom",
    "Zoom in",
    "Automatic zoom",
    "Page fit",
    "Page width",
    "Find",
    "Dark mode",
    "Download",
    "Find in document",
    "Previous match",
    "Next match",
    "Highlight all",
    "Match case",
    "Phrase not found",
    "Close",
    "Failed to load the PDF file",
    "Drop a PDF file here",
    "Enter the password to open this PDF file",
    "Invalid password try again",
    "Too many requests",
    "API key rejected",
    "Quota exceeded",
    "Server error",
    "Request timed out",
    "Network error",
    "No translation returned",
    "Translation failed",
    "No translation engine is enabled",
]


def openJson(filePath):
    jsonDict = dict({})
    try:
        with open(filePath, "r", encoding="utf8") as file:
            jsonDict = json.load(file)
    except FileNotFoundError as e:
        print(e)
    return jsonDict


def writeJson(filePath, jsonDict):
    os.makedirs(os.path.dirname(filePath), exist_ok=True)

    with open(filePath, "w", encoding="utf8") as file:
        json.dump(jsonDict, file, indent="\t", ensure_ascii=False)


def getI18Chrome(text):
    return 'chrome.i18n.getMessage("' + getI18Id(text) + '")'


def getI18Id(text):
    return text.replace(" ", "_")


def getTranslateLangCode(lang):
    if lang in translateLangCodeDict:
        return translateLangCodeDict[lang]
    else:
        return lang


def translate(text, lang):
    try:
        time.sleep(2)
        return translator.translate(
            text, src="auto", dest=getTranslateLangCode(lang)
        ).text
    except Exception as e:
        print(lang)
        print(e)
        return text


def addBasicDescription(jsonDict, locale):
    # the store name is not translated; the description keeps existing translations
    jsonDict["appName"] = {"message": appName}
    if not jsonDict.get("appDesc", {}).get("message"):
        jsonDict["appDesc"] = {"message": appDesc}


def getI18IdList():
    return [getI18Id(i18) for i18 in i18List]


def addI18Description(
    jsonDict,
):
    idList = getI18IdList()
    for i18, i18Id in zip(i18List, idList):
        if i18Id not in jsonDict or not jsonDict[i18Id]["message"]:
            jsonDict[i18Id] = {"message": i18}


def insertI18Json(locale):
    filePath = "./public/_locales/" + locale + "/messages.json"
    jsonData = openJson(filePath)
    addBasicDescription(jsonData, locale)
    addI18Description(jsonData)
    jsonData = recorderJson(jsonData)
    writeJson(filePath, jsonData)


def recorderJson(jsonData):
    orderedList = getI18IdList() + ["appName", "appDesc"]
    newDict = {}
    for name in orderedList:
        newDict[name] = jsonData[name]
    return newDict


for locale in tqdm(localeList):
    insertI18Json(locale)


# for item in itemList:
#     # print(getLocaleBracket(item))
#     print(getI18(item))
