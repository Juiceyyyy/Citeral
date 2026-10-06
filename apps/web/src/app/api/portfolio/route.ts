import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser } from "@/lib/auth";
import { isTrustedMutation } from "@/lib/security/request";
import { assertRateAvailable } from "@/lib/security/rate-limit";

const positionSchema=z.object({
  symbol:z.string().trim().max(40).optional(),name:z.string().trim().max(160),value:z.number().positive(),
  sector:z.string().trim().max(100).optional(),industry:z.string().trim().max(120).optional(),assetClass:z.string().trim().max(80).optional(),
  region:z.string().trim().max(80).optional(),currency:z.string().trim().max(8).optional(),account:z.string().trim().max(120).optional(),
});
const bodySchema=z.object({name:z.string().trim().min(1).max(120).default("My Portfolio"),baseCurrency:z.string().trim().min(3).max(8).default("INR"),positions:z.array(positionSchema).min(1).max(500)});

export async function GET(){
  const {supabase,userId}=await requireApiUser();
  if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
  const {data:portfolio,error}=await supabase.from("portfolios").select("id,name,base_currency,updated_at").eq("owner_user_id",userId).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  if(error)return NextResponse.json({error:error.message},{status:400});
  if(!portfolio)return NextResponse.json({portfolio:null,positions:[]});
  const {data:positions,error:positionError}=await supabase.from("portfolio_positions").select("symbol,name,current_value,sector,industry,asset_class,region,currency,account_name").eq("portfolio_id",portfolio.id).order("current_value",{ascending:false});
  if(positionError)return NextResponse.json({error:positionError.message},{status:400});
  return NextResponse.json({portfolio,positions:(positions??[]).map(p=>({symbol:p.symbol??"",name:p.name,value:Number(p.current_value),sector:p.sector??"",industry:p.industry??"",assetClass:p.asset_class??"",region:p.region??"",currency:p.currency??"",account:p.account_name??""}))});
}

export async function POST(req:Request){if(!isTrustedMutation(req))return NextResponse.json({error:"Cross-origin request rejected"},{status:403});
  const {supabase,userId}=await requireApiUser();
  if(!userId)return NextResponse.json({error:"Unauthorized"},{status:401});
  try{await assertRateAvailable(supabase,"portfolio_write",10,60);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Too many requests"},{status:429});}
  const parsed=bodySchema.safeParse(await req.json().catch(()=>null));
  if(!parsed.success)return NextResponse.json({error:"Invalid portfolio",issues:parsed.error.flatten()},{status:400});
  const {data,error}=await supabase.rpc("replace_portfolio",{p_name:parsed.data.name,p_base_currency:parsed.data.baseCurrency,p_positions:parsed.data.positions});
  if(error)return NextResponse.json({error:error.message},{status:400});
  return NextResponse.json({id:data});
}
