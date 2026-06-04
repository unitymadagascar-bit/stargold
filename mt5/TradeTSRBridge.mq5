// TradeTSRBridge.mq5
// Attach this Expert Advisor to the XAUUSD chart in MetaTrader 5.
// Before running it, add these URLs to:
// Tools > Options > Expert Advisors > Allow WebRequest for listed URL.
//
// http://127.0.0.1:3000
// https://tradetsr.vercel.app

#property strict
#property version "1.10"

input string InpEndpoint = "https://tradetsr.vercel.app/api/market/mt5/ingest";
input bool InpUseCloudFallback = true;
input string InpCloudFallbackEndpoint = "https://tradetsr.vercel.app/api/market/mt5/ingest";
input string InpBridgeToken = "";
input int InpBarsPerTimeframe = 700;
input int InpPushIntervalSeconds = 1;

int OnInit()
{
   EventSetTimer(MathMax(1, InpPushIntervalSeconds));
   return INIT_SUCCEEDED;
}

void OnDeinit(const int reason)
{
   EventKillTimer();
}

void OnTick()
{
   PushTick();
}

void OnTimer()
{
   PushSnapshot();
}

void PushSnapshot()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return;

   string body = "{";
   body += "\"source\":\"MT5\",";
   body += "\"symbol\":\"" + JsonEscape(_Symbol) + "\",";
   body += "\"tick\":" + TickToJson(tick) + ",";
   body += "\"candles\":{";
   body += "\"M1\":" + RatesToJson(PERIOD_M1) + ",";
   body += "\"M5\":" + RatesToJson(PERIOD_M5) + ",";
   body += "\"M15\":" + RatesToJson(PERIOD_M15) + ",";
   body += "\"M30\":" + RatesToJson(PERIOD_M30) + ",";
   body += "\"H1\":" + RatesToJson(PERIOD_H1) + ",";
   body += "\"H4\":" + RatesToJson(PERIOD_H4) + ",";
   body += "\"D1\":" + RatesToJson(PERIOD_D1);
   body += "}}";

   PostJson(body);
}

void PushTick()
{
   MqlTick tick;
   if(!SymbolInfoTick(_Symbol, tick))
      return;

   string body = "{";
   body += "\"source\":\"MT5\",";
   body += "\"symbol\":\"" + JsonEscape(_Symbol) + "\",";
   body += "\"tick\":" + TickToJson(tick);
   body += "}";

   PostJson(body);
}

string TickToJson(const MqlTick &tick)
{
   string json = "{";
   json += "\"symbol\":\"XAUUSD\",";
   json += "\"time\":" + IntegerToString((long)tick.time_msc) + ",";
   json += "\"bid\":" + DoubleToString(tick.bid, _Digits) + ",";
   json += "\"ask\":" + DoubleToString(tick.ask, _Digits) + ",";
   json += "\"price\":" + DoubleToString(tick.bid, _Digits) + ",";
   json += "\"volume\":" + DoubleToString((double)tick.volume, 0);
   json += "}";

   return json;
}

string RatesToJson(ENUM_TIMEFRAMES timeframe)
{
   MqlRates rates[];
   int copied = CopyRates(_Symbol, timeframe, 0, InpBarsPerTimeframe, rates);
   if(copied <= 0)
      return "[]";

   string json = "[";
   for(int i = 0; i < copied; i++)
   {
      if(i > 0)
         json += ",";

      json += "{";
      json += "\"time\":" + IntegerToString((long)rates[i].time) + ",";
      json += "\"open\":" + DoubleToString(rates[i].open, _Digits) + ",";
      json += "\"high\":" + DoubleToString(rates[i].high, _Digits) + ",";
      json += "\"low\":" + DoubleToString(rates[i].low, _Digits) + ",";
      json += "\"close\":" + DoubleToString(rates[i].close, _Digits) + ",";
      json += "\"volume\":" + DoubleToString((double)rates[i].tick_volume, 0);
      json += "}";
   }
   json += "]";

   return json;
}

void PostJson(const string body)
{
   int status = PostJsonToEndpoint(InpEndpoint, body);

   if(status == -1 && InpUseCloudFallback && InpCloudFallbackEndpoint != "" && InpCloudFallbackEndpoint != InpEndpoint)
   {
      int fallbackStatus = PostJsonToEndpoint(InpCloudFallbackEndpoint, body);
      if(fallbackStatus == -1)
         Print("Star Gold By TSR cloud fallback failed too. Add this URL in MT5 WebRequest settings: ", InpCloudFallbackEndpoint);
   }
}

int PostJsonToEndpoint(const string endpoint, const string body)
{
   string url = endpoint;
   if(InpBridgeToken != "")
      url += "?token=" + InpBridgeToken;

   char data[];
   StringToCharArray(body, data, 0, WHOLE_ARRAY, CP_UTF8);
   ArrayResize(data, ArraySize(data) - 1);

   char result[];
   string resultHeaders = "";
   string headers = "Content-Type: application/json\r\n";
   int status = WebRequest("POST", url, headers, 5000, data, result, resultHeaders);

   if(status == -1)
      Print("Star Gold By TSR bridge WebRequest failed. Error: ", GetLastError(), ". Add the URL in MT5 WebRequest settings: ", endpoint);

   return status;
}

string JsonEscape(string value)
{
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   return value;
}
