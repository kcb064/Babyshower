import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { MonsteraLeaf } from "@/components/Botanical";
import { getEditor } from "@/lib/auth";
import { NameForm, PasscodeForm } from "./SignInForms";

export default async function SignInPage() {
  const editor = await getEditor();
  if (editor?.name) redirect("/admin");
  const t = await getTranslations("admin.signIn");
  return (
    <div className="mx-auto max-w-sm px-4 py-12">
      <div className="card relative overflow-hidden p-6">
        <MonsteraLeaf className="pointer-events-none absolute -right-10 -top-10 h-36 text-eucalyptus" />
        <h1 className="relative text-4xl">{editor ? t("nameTitle") : t("title")}</h1>
        <div className="relative mt-6">{editor ? <NameForm /> : <PasscodeForm />}</div>
      </div>
    </div>
  );
}
